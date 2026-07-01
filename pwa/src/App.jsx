import { useEffect, useMemo, useState } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { io } from 'socket.io-client';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'missing-client-id';

export default function App() {
  const [screen, setScreen] = useState('setup');
  const [sessionToken, setSessionToken] = useState('');
  const [sessions, setSessions] = useState([]);
  const [identities] = useState([
    { id: 'uni', initials: 'SH', name: 'University Account', email: 's.hossain@university.edu', tag: 'UNI' },
    { id: 'personal', initials: 'SP', name: 'Personal Account', email: 'skhossain99@gmail.com', tag: 'Personal' },
  ]);

  const socket = useMemo(() => io(backendUrl, { transports: ['websocket'] }), []);

  useEffect(() => {
    socket.on('login-approved', () => setScreen('sessions'));
    socket.on('logout', () => setSessions([]));
    socket.on('session-expired', () => setSessions([]));

    return () => socket.disconnect();
  }, [socket]);

  useEffect(() => {
    if (screen !== 'scan') {
      return undefined;
    }

    const scanner = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: 250 });
    scanner.render((decodedText) => {
      setSessionToken(decodedText);
      socket.emit('login-approved', {
        sessionToken: decodedText,
        encryptedPayload: JSON.stringify({ account: 'placeholder' }),
      });
      setScreen('sessions');
      scanner.clear();
    });

    return () => scanner.clear().catch(() => {});
  }, [screen, socket]);

  useEffect(() => {
    fetch(`${backendUrl}/sessions/active`)
      .then((response) => response.json())
      .then((data) => setSessions(data.sessions || []))
      .catch(() => setSessions([]));
  }, []);

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <main className="phone-shell">
        <header className="topbar">
          <div className="logo-dot">LP</div>
          <div>
            <h1>LabPass PWA</h1>
            <p>Securing shared sessions</p>
          </div>
        </header>

        <section className="panel identities">
          <div className="panel-head">
            <h2>Saved identity</h2>
            <span className="pill">On-device encrypted</span>
          </div>

          <div className="identity-list">
            {identities.map((identity) => (
              <article key={identity.id} className="identity-item">
                <div className="avatar">{identity.initials}</div>
                <div className="identity-body">
                  <h3>
                    {identity.name} <span>{identity.tag}</span>
                  </h3>
                  <p>{identity.email}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="google-login-wrap">
            <GoogleLogin onSuccess={() => setScreen('scan')} onError={() => {}} />
          </div>
        </section>

        <section className="panel sessions">
          <div className="panel-head">
            <h2>Active sessions</h2>
            <span className="count-badge">{sessions.length}</span>
          </div>

          {sessions.length === 0 && (
            <div className="empty-card">
              <div className="empty-icon">[]</div>
              <h3>No active sessions</h3>
              <p>Scan the extension QR from a lab computer to instantly sign in.</p>
            </div>
          )}

          {sessions.length > 0 && (
            <ul className="session-list">
              {sessions.map((session) => (
                <li key={session.id}>
                  <div>
                    <strong>{session.pcId}</strong>
                    <p>Expires: {new Date(session.expiresAt).toLocaleTimeString()}</p>
                  </div>
                  <button onClick={() => socket.emit('logout', { sessionToken: sessionToken || 'placeholder' })}>Logout</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {screen === 'scan' && (
          <section className="panel scanner-panel">
            <h2>QR scanner</h2>
            <div id="qr-reader" />
            <p>Session token: {sessionToken || 'none'}</p>
          </section>
        )}

        <button className="scan-fab" onClick={() => setScreen('scan')}>Scan to login</button>
      </main>
    </GoogleOAuthProvider>
  );
}