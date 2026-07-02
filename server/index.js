require('./src/env');

const fs = require('fs');
const https = require('https');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const { all, get, initializeDatabase, run } = require('./src/db');
const {
  bindSocket,
  createPendingSession,
  getSessionByToken,
  getSessionsByEmail,
  removeSession,
  scheduleExpiry,
  updateRecord,
} = require('./src/sessionStore');

const PORT = Number(process.env.PORT || 3001);
const SESSION_TOKEN_TTL_MS = 60 * 1000;
const ACTIVE_SESSION_TTL_MS = 3 * 60 * 60 * 1000;
const HTTPS_KEY_PATH = process.env.HTTPS_KEY_PATH;
const HTTPS_CERT_PATH = process.env.HTTPS_CERT_PATH;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : null; // null = allow all (dev mode)

function isoFromNow(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function isValidPcId(pcId) {
  return typeof pcId === 'string' && pcId.trim().length > 0 && pcId.trim().length <= 128;
}

function isValidSessionToken(token) {
  return typeof token === 'string' && /^[0-9a-fA-F-]{36}$/.test(token);
}

function isValidLoginPayload(payload) {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      isValidSessionToken(payload.sessionToken) &&
      typeof payload.encryptedPayload === 'string' &&
      payload.encryptedPayload.length > 0,
  );
}

function isValidLogoutPayload(payload) {
  return Boolean(payload && typeof payload === 'object' && isValidSessionToken(payload.sessionToken));
}

function rejectInsecureRequests(req, res, next) {
  // Allow HTTP in development when no certs are configured
  if (!HTTPS_KEY_PATH || !HTTPS_CERT_PATH) {
    next();
    return;
  }

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const secureRequest = req.secure || forwardedProto === 'https';

  if (!secureRequest) {
    res.status(400).json({ error: 'HTTPS required' });
    return;
  }

  next();
}

async function markSessionExpired(sessionId) {
  await run('UPDATE sessions SET status = ?, expires_at = ? WHERE id = ?', ['expired', new Date().toISOString(), sessionId]);
}

async function upsertUser(email, displayName, pictureUrl) {
  // Try to find existing user
  let user = await get('SELECT id, email, display_name, picture_url FROM users WHERE email = ?', [email]);

  if (user) {
    // Update name/picture if changed
    if (displayName || pictureUrl) {
      await run('UPDATE users SET display_name = ?, picture_url = ? WHERE id = ?', [
        displayName || user.display_name,
        pictureUrl || user.picture_url,
        user.id,
      ]);
    }
    return user;
  }

  // Create new user
  const result = await run(
    'INSERT INTO users (email, display_name, picture_url) VALUES (?, ?, ?)',
    [email, displayName || email, pictureUrl || null],
  );

  return { id: Number(result.lastInsertRowid), email, display_name: displayName, picture_url: pictureUrl };
}

async function expireSession(io, token, reason) {
  const session = getSessionByToken(token);
  if (!session) {
    return;
  }

  await markSessionExpired(session.sessionId);

  if (session.socketId) {
    io.to(session.socketId).emit('session-expired', {
      pcId: session.pcId,
      reason,
      sessionId: session.sessionId,
      sessionToken: token,
    });
  }

  removeSession(token);
}

async function main() {
  await initializeDatabase();

  const app = express();
  app.use(helmet());
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // CORS — locked to allowed origins in production
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS) {
      if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  });
  app.use(rejectInsecureRequests);
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  // ── Routes ──

  app.get('/', (req, res) => {
    res.type('text/plain').send('LabPass server is running. Use POST /session/create or GET /sessions/active.');
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.post('/session/create', async (req, res, next) => {
    try {
      const { pcId } = req.body || {};
      if (!isValidPcId(pcId)) {
        res.status(400).json({ error: 'pcId is required' });
        return;
      }

      const createdAt = new Date().toISOString();
      const expiresAt = isoFromNow(SESSION_TOKEN_TTL_MS);
      const result = await run(
        'INSERT INTO sessions (pc_id, status, created_at, expires_at) VALUES (?, ?, ?, ?)',
        [pcId.trim(), 'pending', createdAt, expiresAt],
      );

      const sessionId = Number(result.lastInsertRowid);
      const { token, record } = createPendingSession({ sessionId, pcId: pcId.trim(), expiresAt });

      scheduleExpiry(token, expiresAt, async (expiredToken) => {
        await expireSession(io, expiredToken, 'unused');
      });

      res.status(201).json({
        sessionToken: token,
        sessionId,
        pcId: record.pcId,
        expiresAt,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/sessions/active', async (req, res, next) => {
    try {
      const email = req.query.email;

      let sessions;
      if (email) {
        sessions = await all(
          'SELECT id, pc_id, account_email, status, created_at, expires_at FROM sessions WHERE status = ? AND expires_at > ? AND account_email = ? ORDER BY created_at DESC',
          ['active', new Date().toISOString(), email],
        );
      } else {
        sessions = await all(
          'SELECT id, pc_id, account_email, status, created_at, expires_at FROM sessions WHERE status = ? AND expires_at > ? ORDER BY created_at DESC',
          ['active', new Date().toISOString()],
        );
      }

      res.json({
        sessions: sessions.map((session) => ({
          id: session.id,
          pcId: session.pc_id,
          accountEmail: session.account_email,
          status: session.status,
          createdAt: session.created_at,
          expiresAt: session.expires_at,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/session/:token/status', async (req, res, next) => {
    try {
      const { token } = req.params;
      if (!isValidSessionToken(token)) {
        res.status(400).json({ error: 'Invalid session token' });
        return;
      }

      const session = getSessionByToken(token);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.json({
        status: session.status,
        pcId: session.pcId,
        expiresAt: session.expiresAt,
        accountEmail: session.userEmail || null,
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, req, res, next) => {
    void req;
    void next;
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  // ── Server Setup ──

  let httpServer;

  if (HTTPS_KEY_PATH && HTTPS_CERT_PATH) {
    httpServer = https.createServer(
      {
        key: fs.readFileSync(path.resolve(HTTPS_KEY_PATH)),
        cert: fs.readFileSync(path.resolve(HTTPS_CERT_PATH)),
      },
      app,
    );
    console.log('Starting in HTTPS mode');
  } else {
    // Fallback to HTTP for development
    const http = require('http');
    httpServer = http.createServer(app);
    console.log('Starting in HTTP mode (no certs configured)');
  }

  const io = new Server(httpServer, {
    cors: {
      origin: ALLOWED_ORIGINS || true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket'],
  });

  // ── Socket Events ──

  io.on('connection', (socket) => {
    // Extension: bind socket to a session after QR is generated
    socket.on('qr-generated', async (payload, ack) => {
      if (!payload || typeof payload !== 'object' || !isValidSessionToken(payload.sessionToken)) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: 'Invalid session token' });
        }
        return;
      }

      const session = getSessionByToken(payload.sessionToken);
      if (!session) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: 'Unknown session token' });
        }
        return;
      }

      bindSocket(payload.sessionToken, socket.id);
      if (typeof ack === 'function') {
        ack({ ok: true });
      }
    });

    // PWA: approve login with user identity
    socket.on('login-approved', async (payload, ack) => {
      if (!isValidLoginPayload(payload)) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: 'Invalid login payload' });
        }
        return;
      }

      const session = getSessionByToken(payload.sessionToken);
      if (!session) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: 'Session not found' });
        }
        return;
      }

      // Extract user info from payload
      let userEmail = payload.email || null;
      let displayName = payload.displayName || null;
      let pictureUrl = payload.pictureUrl || null;

      // Also try to parse from encryptedPayload for backward compat
      if (!userEmail) {
        try {
          const parsed = JSON.parse(payload.encryptedPayload);
          userEmail = parsed.email || null;
          displayName = displayName || parsed.displayName || parsed.name || null;
          pictureUrl = pictureUrl || parsed.pictureUrl || parsed.picture || null;
        } catch {
          // not JSON, that's ok
        }
      }

      // Upsert user if we have an email
      let userId = null;
      if (userEmail) {
        try {
          const user = await upsertUser(userEmail, displayName, pictureUrl);
          userId = user.id;
        } catch (err) {
          console.error('Failed to upsert user:', err);
        }
      }

      const activeUntil = isoFromNow(ACTIVE_SESSION_TTL_MS);
      await run(
        'UPDATE sessions SET status = ?, expires_at = ?, user_id = ?, account_email = ? WHERE id = ?',
        ['active', activeUntil, userId, userEmail, session.sessionId],
      );
      updateRecord(payload.sessionToken, {
        status: 'active',
        expiresAt: activeUntil,
        userEmail,
        displayName,
        pictureUrl,
      });

      scheduleExpiry(payload.sessionToken, activeUntil, async (expiredToken, expiredRecord) => {
        void expiredRecord;
        await expireSession(io, expiredToken, 'timeout');
      });

      io.to(session.socketId || socket.id).emit('login-approved', {
        sessionToken: payload.sessionToken,
        encryptedPayload: payload.encryptedPayload,
        email: userEmail,
        displayName,
      });

      if (typeof ack === 'function') {
        ack({ ok: true });
      }
    });

    // PWA or Extension: logout
    socket.on('logout', async (payload, ack) => {
      if (!isValidLogoutPayload(payload)) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: 'Invalid logout payload' });
        }
        return;
      }

      const session = getSessionByToken(payload.sessionToken);
      if (!session) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: 'Session not found' });
        }
        return;
      }

      await run('UPDATE sessions SET status = ?, expires_at = ? WHERE id = ?', ['logged_out', new Date().toISOString(), session.sessionId]);
      io.to(session.socketId || socket.id).emit('logout', {
        pcId: session.pcId,
        sessionToken: payload.sessionToken,
      });

      removeSession(payload.sessionToken);

      if (typeof ack === 'function') {
        ack({ ok: true });
      }
    });

    // Keepalive from extension background worker
    socket.on('keepalive', () => {
      // no-op, just keeps the connection alive
    });
  });

  httpServer.listen(PORT, () => {
    const protocol = HTTPS_KEY_PATH ? 'https' : 'http';
    console.log(`LabPass server listening on ${protocol}://localhost:${PORT}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});