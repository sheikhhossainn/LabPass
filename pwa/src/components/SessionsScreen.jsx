import React from 'react';

export default function SessionsScreen({ sessions, onLogout }) {
  return (
    <section className="panel sessions animate-in">
      <div className="panel-head">
        <h2>Active Sessions</h2>
        <span className="count-badge">{sessions.length}</span>
      </div>

      {sessions.length === 0 ? (
        <div className="empty-card">
          <div className="empty-icon">✓</div>
          <h3>No active sessions</h3>
          <p>Scan the extension QR from a lab computer to instantly sign in.</p>
        </div>
      ) : (
        <ul className="session-list">
          {sessions.map((session) => (
            <li key={session.id} className="session-item">
              <div className="session-info">
                <strong>{session.pcId}</strong>
                <p>Expires: {new Date(session.expiresAt).toLocaleTimeString()}</p>
                <p className="session-account">{session.accountEmail}</p>
              </div>
              <button 
                className="btn-danger" 
                onClick={() => onLogout(session.sessionToken || session.token)}
              >
                End Session
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
