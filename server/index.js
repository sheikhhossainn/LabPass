require('./src/env');

const fs = require('fs');
const https = require('https');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const { all, initializeDatabase, run } = require('./src/db');
const {
  bindSocket,
  createPendingSession,
  getSessionByToken,
  removeSession,
  scheduleExpiry,
  updateRecord,
} = require('./src/sessionStore');

const PORT = Number(process.env.PORT || 3001);
const SESSION_TOKEN_TTL_MS = 60 * 1000;
const ACTIVE_SESSION_TTL_MS = 3 * 60 * 60 * 1000;
const HTTPS_KEY_PATH = process.env.HTTPS_KEY_PATH;
const HTTPS_CERT_PATH = process.env.HTTPS_CERT_PATH;

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
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  const secureRequest = req.secure || forwardedProto === 'https';

  if (!secureRequest) {
    res.status(400).json({ error: 'HTTPS required' });
    return;
  }

  next();
}

async function markSessionExpired(sessionId) {
  await run('UPDATE sessions SET status = $1, expires_at = $2 WHERE id = $3', ['expired', new Date().toISOString(), sessionId]);
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
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Origin', '*');
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

  app.get('/', (req, res) => {
    res.type('text/plain').send('LabPass server is running. Use POST /session/create or GET /sessions/active.');
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
        'INSERT INTO sessions (pc_id, status, created_at, expires_at) VALUES ($1, $2, $3, $4) RETURNING id',
        [pcId.trim(), 'pending', createdAt, expiresAt],
      );

      const sessionId = result.rows[0].id;
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
      const sessions = await all(
        'SELECT id, pc_id, status, created_at, expires_at FROM sessions WHERE status = $1 AND expires_at > $2 ORDER BY created_at DESC',
        ['active', new Date().toISOString()],
      );

      res.json({
        sessions: sessions.map((session) => ({
          id: session.id,
          pcId: session.pc_id,
          status: session.status,
          createdAt: session.created_at,
          expiresAt: session.expires_at,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, req, res, next) => {
    void req;
    void next;
    res.status(500).json({ error: 'Internal Server Error' });
  });

  if (!HTTPS_KEY_PATH || !HTTPS_CERT_PATH) {
    throw new Error('HTTPS_KEY_PATH and HTTPS_CERT_PATH are required to enforce HTTPS/WSS-only connections');
  }

  const httpsServer = https.createServer(
    {
      key: fs.readFileSync(path.resolve(HTTPS_KEY_PATH)),
      cert: fs.readFileSync(path.resolve(HTTPS_CERT_PATH)),
    },
    app,
  );

  const io = new Server(httpsServer, {
    cors: {
      origin: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket'],
  });

  io.on('connection', (socket) => {
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

      const activeUntil = isoFromNow(ACTIVE_SESSION_TTL_MS);
      await run('UPDATE sessions SET status = $1, expires_at = $2 WHERE id = $3', ['active', activeUntil, session.sessionId]);
      updateRecord(payload.sessionToken, { status: 'active', expiresAt: activeUntil });

      scheduleExpiry(payload.sessionToken, activeUntil, async (expiredToken, expiredRecord) => {
        void expiredRecord;
        await expireSession(io, expiredToken, 'timeout');
      });

      io.to(session.socketId || socket.id).emit('login-approved', {
        sessionToken: payload.sessionToken,
        encryptedPayload: payload.encryptedPayload,
      });

      if (typeof ack === 'function') {
        ack({ ok: true });
      }
    });

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

      await run('UPDATE sessions SET status = $1, expires_at = $2 WHERE id = $3', ['logged_out', new Date().toISOString(), session.sessionId]);
      io.to(session.socketId || socket.id).emit('logout', {
        pcId: session.pcId,
        sessionToken: payload.sessionToken,
      });

      removeSession(payload.sessionToken);

      if (typeof ack === 'function') {
        ack({ ok: true });
      }
    });
  });

  httpsServer.listen(PORT, () => {
    console.log(`LabPass server listening on https://localhost:${PORT}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});