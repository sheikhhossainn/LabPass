const test = require('node:test');
const assert = require('node:assert');
const { createPendingSession, getSessionByToken, removeSession, bindSocket, updateRecord } = require('../src/sessionStore');

test('Session Lifecycle', async (t) => {
  let sessionToken;
  let sessionId = 123;
  let pcId = 'Test-PC';

  await t.test('createPendingSession creates a valid session', () => {
    const expiresAt = new Date(Date.now() + 60000).toISOString();
    const result = createPendingSession({ sessionId, pcId, expiresAt });
    
    assert.ok(result.token, 'Should return a token');
    assert.ok(result.record, 'Should return a record');
    assert.strictEqual(result.record.status, 'pending');
    assert.strictEqual(result.record.pcId, pcId);
    
    sessionToken = result.token;
  });

  await t.test('getSessionByToken retrieves the session', () => {
    const session = getSessionByToken(sessionToken);
    assert.ok(session, 'Session should exist');
    assert.strictEqual(session.sessionId, sessionId);
  });

  await t.test('bindSocket adds socketId', () => {
    const socketId = 'socket-456';
    const updated = bindSocket(sessionToken, socketId);
    assert.strictEqual(updated.socketId, socketId);
    
    const session = getSessionByToken(sessionToken);
    assert.strictEqual(session.socketId, socketId);
  });

  await t.test('updateRecord modifies the session', () => {
    const activeUntil = new Date(Date.now() + 3600000).toISOString();
    const email = 'test@example.com';
    
    const updated = updateRecord(sessionToken, {
      status: 'active',
      expiresAt: activeUntil,
      userEmail: email
    });
    
    assert.strictEqual(updated.status, 'active');
    assert.strictEqual(updated.userEmail, email);
    
    const session = getSessionByToken(sessionToken);
    assert.strictEqual(session.status, 'active');
    assert.strictEqual(session.userEmail, email);
  });

  await t.test('removeSession deletes the session', () => {
    const removed = removeSession(sessionToken);
    assert.strictEqual(removed, true);
    
    const session = getSessionByToken(sessionToken);
    assert.strictEqual(session, null);
  });
});
