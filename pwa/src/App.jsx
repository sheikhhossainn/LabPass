import React, { useEffect, useMemo, useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { io } from 'socket.io-client';

import HomeScreen from './components/HomeScreen';
import ScannerScreen from './components/ScannerScreen';
import SessionsScreen from './components/SessionsScreen';
import InstallGate from './components/InstallGate';

import { getAccounts, addAccount, removeAccount } from './lib/db';
import { encryptPayload, decodeIdToken } from './lib/crypto';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'missing-client-id';

function getInstalledState() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function getRouteFromHash() {
  const route = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  if (route === 'scan' || route === 'sessions' || route === 'setup') {
    return route;
  }

  return 'setup';
}

function setRouteHash(route) {
  window.location.hash = `#/${route}`;
}

export default function App() {
  const [isInstalled, setIsInstalled] = useState(() => getInstalledState());
  const [route, setRoute] = useState(() => (getInstalledState() ? getRouteFromHash() : 'install'));
  const [accounts, setAccounts] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [scannedToken, setScannedToken] = useState(null);
  const [selectedAccountEmail, setSelectedAccountEmail] = useState(() => {
    try {
      return sessionStorage.getItem('labpass.selectedAccountEmail') || '';
    } catch {
      return '';
    }
  });
  const [splash, setSplash] = useState(true);

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const selectedAccount = accounts.find((account) => account.email === selectedAccountEmail) || null;

  const navigateTo = (nextRoute) => {
    if (!isInstalled) {
      setRoute('install');
      setRouteHash('install');
      return;
    }

    setRoute(nextRoute);
    setRouteHash(nextRoute);
  };

  useEffect(() => {
    const syncInstallationState = () => {
      const installed = getInstalledState();
      setIsInstalled(installed);

      if (!installed) {
        setRoute('install');
        setRouteHash('install');
        return;
      }

      const nextRoute = getRouteFromHash();
      setRoute(nextRoute);
    };

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
      setRoute('setup');
      setRouteHash('setup');
    };

    const handleHashChange = () => {
      const installed = getInstalledState();
      setIsInstalled(installed);
      setRoute(installed ? getRouteFromHash() : 'install');
    };

    syncInstallationState();
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const socket = useMemo(() => io(backendUrl, { transports: ['websocket'] }), []);

  useEffect(() => {
    if (!isInstalled) {
      setRoute('install');
      return;
    }

    if (route === 'install') {
      setRoute('setup');
      setRouteHash('setup');
    }
  }, [isInstalled, route]);

  useEffect(() => {
    if (!isInstalled || route !== 'scan' || accounts.length === 0) {
      return;
    }

    if (selectedAccount) {
      return;
    }

    if (accounts.length === 1) {
      setSelectedAccountEmail(accounts[0].email);
      return;
    }

    setScannedToken(null);
    setRoute('setup');
    setRouteHash('setup');
  }, [accounts, isInstalled, route, selectedAccount]);

  useEffect(() => {
    try {
      if (selectedAccountEmail) {
        sessionStorage.setItem('labpass.selectedAccountEmail', selectedAccountEmail);
      } else {
        sessionStorage.removeItem('labpass.selectedAccountEmail');
      }
    } catch {
      // Ignore storage failures; the flow still works without persistence.
    }
  }, [selectedAccountEmail]);

  // Load accounts on mount
  useEffect(() => {
    getAccounts().then(setAccounts).catch(console.error);
  }, []);

  // Hide splash screen after 2 seconds
  useEffect(() => {
    const timer = setTimeout(() => setSplash(false), 2000);
    return () => clearTimeout(timer);
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
      setRoute('sessions');
      setRouteHash('sessions');
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
    let email, displayName, pictureUrl, idToken;
    
    if (credentialResponse.access_token) {
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${credentialResponse.access_token}` },
        });
        const userInfo = await res.json();
        email = userInfo.email;
        displayName = userInfo.name;
        pictureUrl = userInfo.picture;
        idToken = credentialResponse.access_token; // Use access token as placeholder idToken
      } catch (err) {
        console.error("Failed to fetch user info", err);
        return;
      }
    } else {
      const { credential } = credentialResponse;
      const decoded = decodeIdToken(credential);
      if (!decoded) return;
      email = decoded.email;
      displayName = decoded.name;
      pictureUrl = decoded.picture;
      idToken = credential;
    }

    try {
      await addAccount({
        email,
        displayName,
        pictureUrl,
        idToken
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
      if (selectedAccountEmail === email) {
        setSelectedAccountEmail('');
        if (route === 'scan') {
          navigateTo('setup');
        }
      }
    } catch (error) {
      console.error('Failed to remove account', error);
    }
  };

  const handleScanSuccess = (decodedText) => {
    const account = selectedAccount || (accounts.length === 1 ? accounts[0] : null);

    if (!account) {
      alert('Select an account before scanning.');
      navigateTo('setup');
      return;
    }

    let token = decodedText;
    
    // Parse QR if it's JSON (the extension sends JSON)
    try {
      const parsed = JSON.parse(decodedText);
      token = parsed.token;
    } catch {
      // If it's just the raw token string
    }

    setScannedToken(token);
    
    approveLogin(token, account);
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
    
    setSelectedAccountEmail('');
    setScannedToken(null);
    setRoute('sessions');
    setRouteHash('sessions');
  };

  const handleLogout = (sessionToken) => {
    socket.emit('logout', { sessionToken });
    setSessions(sessions.filter(s => s.sessionToken !== sessionToken));
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      // ignore prompt failures; appinstalled handles the success path
    }
  };

  if (splash) {
    return (
      <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <img src="/logo-animated.svg" alt="Loading LabPass..." className="splash-logo" />
      </div>
    );
  }

  if (!isInstalled) {
    return (
      <InstallGate
        isIOS={isIOS}
        deferredPrompt={deferredPrompt}
        onInstall={handleInstallClick}
      />
    );
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <main className="phone-shell">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <img src="/logo.svg" alt="LabPass" className="logo-dot" />
            <div>
              <h1>LabPass</h1>
              <p>Securing shared sessions</p>
            </div>
          </div>
        </header>

        {/* Navigation Tabs */}
        <div className="nav-tabs">
          <button 
            className={`nav-tab ${route === 'setup' || route === 'scan' ? 'active' : ''}`}
            onClick={() => navigateTo('setup')}
          >
            Setup
          </button>
          <button 
            className={`nav-tab ${route === 'sessions' ? 'active' : ''}`}
            onClick={() => navigateTo('sessions')}
          >
            Sessions
            {sessions.length > 0 && <span className="badge">{sessions.length}</span>}
          </button>
        </div>

        {route === 'setup' && (
          <HomeScreen 
            accounts={accounts} 
            onAddAccount={handleAddAccount} 
            onRemoveAccount={handleRemoveAccount} 
            onStartScan={(account) => {
              setScannedToken(null);
              setSelectedAccountEmail(account.email);
              navigateTo('scan');
            }}
            onViewSessions={() => navigateTo('sessions')}
          />
        )}

        {route === 'sessions' && (
          <SessionsScreen 
            sessions={sessions} 
            onLogout={handleLogout} 
          />
        )}

        {route === 'scan' && (
          <ScannerScreen 
            onScanSuccess={handleScanSuccess} 
            onCancel={() => {
              setScannedToken(null);
              setSelectedAccountEmail('');
              navigateTo('setup');
            }}
            selectedAccount={selectedAccount}
          />
        )}

      </main>
    </GoogleOAuthProvider>
  );
}