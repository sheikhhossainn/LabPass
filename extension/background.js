/**
 * LabPass Extension — Background Service Worker
 *
 * Maintains a WebSocket connection to the relay server, handles login/logout/expiry events,
 * and clears browsing data on session end. Uses keepalive to prevent SW termination.
 */

/* ── State ── */
let socket = null;
let keepAliveTimer = null;
let currentSession = null; // { sessionToken, pcId, serverUrl, expiresAt }

/* ── Socket.IO (loaded from bundled lib) ── */

importScripts('lib/socket.io.min.js');

/* ── Helpers ── */

function log(...args) {
  console.log('[LabPass BG]', ...args);
}

function broadcastToPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // popup might not be open, that's fine
  });
}

/* ── Socket Connection ── */

function connectSocket(serverUrl, sessionToken) {
  if (socket) {
    socket.disconnect();
  }

  // io() is available from the imported socket.io.min.js
  socket = io(serverUrl, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    log('Socket connected');
    broadcastToPopup({ type: 'SOCKET_CONNECTED' });

    // Bind this socket to the session
    socket.emit('qr-generated', { sessionToken }, (ack) => {
      if (ack && ack.ok) {
        log('Socket bound to session');
      } else {
        log('Failed to bind socket:', ack);
      }
    });

    startKeepalive();
  });

  socket.on('disconnect', (reason) => {
    log('Socket disconnected:', reason);
    broadcastToPopup({ type: 'SOCKET_DISCONNECTED' });
    stopKeepalive();
  });

  socket.on('connect_error', (err) => {
    log('Socket connect error:', err.message);
  });

  // ── Login Approved ──
  socket.on('login-approved', async (data) => {
    log('Login approved:', data);

    let email = 'Unknown';
    try {
      const payload = JSON.parse(data.encryptedPayload || '{}');
      email = payload.email || payload.account || 'Unknown';
    } catch {
      // ignore parse errors
    }

    const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

    // Store session
    currentSession = {
      ...currentSession,
      sessionToken: data.sessionToken,
      email,
      expiresAt,
      status: 'active',
    };

    await chrome.storage.local.set({ activeSession: currentSession });
    await chrome.storage.local.remove('pendingSession');

    // Update badge
    chrome.action.setBadgeText({ text: '1' });
    chrome.action.setBadgeBackgroundColor({ color: '#34d399' });

    broadcastToPopup({
      type: 'LOGIN_APPROVED',
      email,
      expiresAt,
      sessionToken: data.sessionToken,
    });
  });

  // ── Logout ──
  socket.on('logout', async (data) => {
    log('Logout received:', data);
    await cleanupSession('logout');
  });

  // ── Session Expired ──
  socket.on('session-expired', async (data) => {
    log('Session expired:', data);
    await cleanupSession('expired');
  });
}

/* ── Keepalive ── */

function startKeepalive() {
  stopKeepalive();
  keepAliveTimer = setInterval(() => {
    if (socket && socket.connected) {
      socket.emit('keepalive', { timestamp: Date.now() });
    }
  }, 20000); // every 20s to stay within 30s SW limit
}

function stopKeepalive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

/* ── Session Cleanup ── */

async function cleanupSession(reason) {
  log('Cleaning up session, reason:', reason);

  // Clear browsing data (cookies, cache, localStorage)
  try {
    await chrome.browsingData.remove(
      {
        since: currentSession
          ? new Date(currentSession.createdAt || Date.now() - 3 * 60 * 60 * 1000).getTime()
          : 0,
      },
      {
        cookies: true,
        cache: true,
        localStorage: true,
        sessionStorage: true,
      }
    );
    log('Browsing data cleared');
  } catch (err) {
    log('Failed to clear browsing data:', err);
  }

  // Clear stored session
  currentSession = null;
  await chrome.storage.local.remove(['activeSession', 'pendingSession']);

  // Reset badge
  chrome.action.setBadgeText({ text: '' });

  broadcastToPopup({ type: reason === 'logout' ? 'LOGGED_OUT' : 'SESSION_EXPIRED' });
}

/* ── Idle Detection ── */

async function setupIdleDetection() {
  try {
    const config = await chrome.storage.sync.get(['idleTimeout']);
    const timeoutMinutes = config.idleTimeout || 15;

    chrome.idle.setDetectionInterval(timeoutMinutes * 60);

    chrome.idle.onStateChanged.addListener(async (state) => {
      if (state === 'idle' || state === 'locked') {
        log('System idle/locked, checking for active session');

        const stored = await chrome.storage.local.get(['activeSession']);
        if (stored.activeSession && stored.activeSession.sessionToken) {
          log('Auto-logout due to idle');

          // Notify server
          if (socket && socket.connected) {
            socket.emit('logout', { sessionToken: stored.activeSession.sessionToken });
          }

          await cleanupSession('idle');
        }
      }
    });
  } catch (err) {
    log('Idle detection setup failed:', err);
  }
}

/* ── Message Handler (from popup) ── */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SESSION_CREATED': {
      currentSession = {
        sessionToken: message.sessionToken,
        pcId: message.pcId,
        serverUrl: message.serverUrl,
        expiresAt: message.expiresAt,
        createdAt: new Date().toISOString(),
        status: 'pending',
      };

      // Persist immediately: the QR is displayed and waiting to be scanned,
      // which can outlive this service worker instance (MV3 SWs are killed
      // after ~30s idle). Without this, a SW restart during that wait has
      // nothing to reconnect/rebind, silently orphaning a still-valid QR.
      chrome.storage.local.set({ pendingSession: currentSession }).catch(() => {});

      connectSocket(message.serverUrl, message.sessionToken);
      sendResponse({ ok: true });
      break;
    }

    case 'LOGOUT': {
      if (socket && socket.connected && message.sessionToken) {
        socket.emit('logout', { sessionToken: message.sessionToken }, (ack) => {
          log('Logout ack:', ack);
        });
      }
      // cleanup will happen when server echoes back
      sendResponse({ ok: true });
      break;
    }

    case 'GET_STATUS': {
      sendResponse({
        connected: socket ? socket.connected : false,
        session: currentSession,
      });
      break;
    }
  }

  return true; // keep channel open for async sendResponse
});

/* ── Connection Watchdog ──
 * MV3 kills this service worker after ~30s of inactivity, which drops the
 * socket. A plain setInterval keepalive doesn't prevent that (it doesn't
 * count as extension activity), so a QR can still be within its 5-minute
 * TTL server-side while its socket binding is dead. chrome.alarms survives
 * SW death and wakes it back up on schedule, so we use it to detect a lost
 * connection and rebind — for either a pending (not-yet-scanned) QR or an
 * already-active session.
 */

async function ensureConnection() {
  if (socket && socket.connected) {
    return;
  }

  let session = currentSession;
  if (!session) {
    const stored = await chrome.storage.local.get(['activeSession']);
    session = stored.activeSession || null;
  }

  if (!session || !session.sessionToken || !session.serverUrl) {
    return;
  }

  if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
    if (session.status === 'active') {
      await cleanupSession('expired');
    } else {
      currentSession = null;
      await chrome.storage.local.remove('pendingSession');
    }
    return;
  }

  currentSession = session;
  log('Watchdog reconnecting socket for', session.status, 'session');
  connectSocket(session.serverUrl, session.sessionToken);
}

chrome.alarms.create('labpass-watchdog', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'labpass-watchdog') {
    ensureConnection();
  }
});

/* ── Init ── */

(async () => {
  log('Background service worker started');
  await setupIdleDetection();
  await ensureConnection();

  if (currentSession && currentSession.status === 'active') {
    chrome.action.setBadgeText({ text: '1' });
    chrome.action.setBadgeBackgroundColor({ color: '#34d399' });
    log('Restored active session');
  }
})();
