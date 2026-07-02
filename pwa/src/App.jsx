import React, { useEffect, useMemo, useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { io } from 'socket.io-client';

import HomeScreen from './components/HomeScreen';
import ScannerScreen from './components/ScannerScreen';
import SessionsScreen from './components/SessionsScreen';
import AccountPicker from './components/AccountPicker';

import { getAccounts, addAccount, removeAccount } from './lib/db';
import { encryptPayload, decodeIdToken } from './lib/crypto';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'missing-client-id';

export default function App() {
  const [screen, setScreen] = useState('home'); // home, scan, sessions
  const [accounts, setAccounts] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [scannedToken, setScannedToken] = useState(null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  const socket = useMemo(() => io(backendUrl, { transports: ['websocket'] }), []);

  // Load accounts on mount
  useEffect(() => {
    getAccounts().then(setAccounts).catch(console.error);
  }, []);

  // Fetch sessions for all accounts periodically
  useEffect(() => {
    const fetchSessions = async () => {
      let allSessions = [];
      for (const account of accounts) {
        try {
          const res = await fetch(`${backendUrl}/sessions/active?email=${encodeURIComponent(account.email)}`);
          if (res.ok) {
            const data = await res.json();
            // deduplicate if multiple accounts on same PC? The server now returns session.accountEmail
            allSessions = [...allSessions, ...data.sessions];
          }
        } catch (e) {
          console.error('Failed to fetch sessions for', account.email, e);
        }
      }
      
      // Filter out duplicate session IDs if any
      const uniqueSessions = Array.from(new Map(allSessions.map(s => [s.id, s])).values());
      
      // Sort by createdAt desc
      uniqueSessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      setSessions(uniqueSessions);
    };

    fetchSessions();
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, [accounts]);

  useEffect(() => {
    socket.on('login-approved', (data) => {
      console.log('Login approved via socket', data);
      setScreen('sessions');
    });
    socket.on('logout', (data) => {
      console.log('Logout via socket', data);
      setSessions(s => s.filter(x => x.sessionToken !== data.sessionToken));
    });
    socket.on('session-expired', (data) => {
      console.log('Session expired via socket', data);
      setSessions(s => s.filter(x => x.sessionToken !== data.sessionToken));
    });

    return () => {
      socket.off('login-approved');
      socket.off('logout');
      socket.off('session-expired');
    };
  }, [socket]);

  const handleAddAccount = async (credentialResponse) => {
    const { credential } = credentialResponse;
    const decoded = decodeIdToken(credential);
    if (!decoded) return;

    try {
      await addAccount({
        email: decoded.email,
        displayName: decoded.name,
        pictureUrl: decoded.picture,
        idToken: credential
      });
      const updatedAccounts = await getAccounts();
      setAccounts(updatedAccounts);
    } catch (error) {
      console.error('Failed to save account', error);
    }
  };

  const handleRemoveAccount = async (email) => {
    try {
      await removeAccount(email);
      const updatedAccounts = await getAccounts();
      setAccounts(updatedAccounts);
    } catch (error) {
      console.error('Failed to remove account', error);
    }
  };

  const handleScanSuccess = (decodedText) => {
    let token = decodedText;
    
    // Parse QR if it's JSON (the extension sends JSON)
    try {
      const parsed = JSON.parse(decodedText);
      token = parsed.token;
    } catch {
      // If it's just the raw token string
    }

    setScannedToken(token);
    
    if (accounts.length === 1) {
      // Auto-select if only one account
      approveLogin(token, accounts[0]);
    } else if (accounts.length > 1) {
      // Show picker
      setShowAccountPicker(true);
    } else {
      alert("Please add an account first.");
      setScreen('home');
    }
  };

  const approveLogin = (token, account) => {
    const payload = {
      email: account.email,
      displayName: account.displayName,
      pictureUrl: account.pictureUrl,
    };

    socket.emit('login-approved', {
      sessionToken: token,
      email: account.email,
      displayName: account.displayName,
      pictureUrl: account.pictureUrl,
      encryptedPayload: encryptPayload(payload),
    });
    
    setShowAccountPicker(false);
    setScannedToken(null);
    setScreen('sessions');
  };

  const handleLogout = (sessionToken) => {
    socket.emit('logout', { sessionToken });
    setSessions(sessions.filter(s => s.sessionToken !== sessionToken));
  };

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <main className="phone-shell">
        <header className="topbar">
          <div className="logo-dot">LP</div>
          <div>
            <h1>LabPass</h1>
            <p>Securing shared sessions</p>
          </div>
        </header>

        {/* Navigation Tabs */}
        <div className="nav-tabs">
          <button 
            className={`nav-tab ${screen === 'home' ? 'active' : ''}`}
            onClick={() => setScreen('home')}
          >
            Accounts
          </button>
          <button 
            className={`nav-tab ${screen === 'sessions' ? 'active' : ''}`}
            onClick={() => setScreen('sessions')}
          >
            Sessions
            {sessions.length > 0 && <span className="badge">{sessions.length}</span>}
          </button>
        </div>

        {screen === 'home' && (
          <HomeScreen 
            accounts={accounts} 
            onAddAccount={handleAddAccount} 
            onRemoveAccount={handleRemoveAccount} 
            onScanClick={() => setScreen('scan')} 
          />
        )}

        {screen === 'sessions' && (
          <SessionsScreen 
            sessions={sessions} 
            onLogout={handleLogout} 
          />
        )}

        {screen === 'scan' && (
          <ScannerScreen 
            onScanSuccess={handleScanSuccess} 
            onCancel={() => setScreen('home')} 
          />
        )}

        {showAccountPicker && (
          <AccountPicker
            accounts={accounts}
            onSelect={(account) => approveLogin(scannedToken, account)}
            onCancel={() => {
              setShowAccountPicker(false);
              setScannedToken(null);
              setScreen('home');
            }}
          />
        )}

      </main>
    </GoogleOAuthProvider>
  );
}