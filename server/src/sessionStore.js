const { randomUUID } = require('crypto');

const sessionsByToken = new Map();
const tokenBySessionId = new Map();

function nowIso() {
  return new Date().toISOString();
}

function createPendingSession({ sessionId, pcId, expiresAt }) {
  const token = randomUUID();
  const record = {
    sessionId,
    pcId,
    status: 'pending',
    createdAt: nowIso(),
    expiresAt,
    socketId: null,
    timer: null,
  };

  sessionsByToken.set(token, record);
  tokenBySessionId.set(sessionId, token);

  return { token, record };
}

function getSessionByToken(token) {
  return sessionsByToken.get(token) || null;
}

function getSessionById(sessionId) {
  const token = tokenBySessionId.get(sessionId);
  if (!token) {
    return null;
  }

  const record = sessionsByToken.get(token);
  return record ? { token, record } : null;
}

function bindSocket(token, socketId) {
  const record = sessionsByToken.get(token);
  if (!record) {
    return null;
  }

  record.socketId = socketId;
  return record;
}

function updateRecord(token, changes) {
  const record = sessionsByToken.get(token);
  if (!record) {
    return null;
  }

  Object.assign(record, changes);
  return record;
}

function scheduleExpiry(token, expiresAt, onExpire) {
  const record = sessionsByToken.get(token);
  if (!record) {
    return null;
  }

  if (record.timer) {
    clearTimeout(record.timer);
  }

  const delay = Math.max(new Date(expiresAt).getTime() - Date.now(), 0);
  record.timer = setTimeout(() => onExpire(token, { ...record }), delay);
  return record.timer;
}

function removeSession(token) {
  const record = sessionsByToken.get(token);
  if (!record) {
    return false;
  }

  if (record.timer) {
    clearTimeout(record.timer);
  }

  sessionsByToken.delete(token);
  tokenBySessionId.delete(record.sessionId);
  return true;
}

module.exports = {
  bindSocket,
  createPendingSession,
  getSessionById,
  getSessionByToken,
  removeSession,
  scheduleExpiry,
  updateRecord,
};