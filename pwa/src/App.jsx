import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { io } from 'socket.io-client';

import HomeScreen from './components/HomeScreen';
import ScannerScreen from './components/ScannerScreen';
import SessionsScreen from './components/SessionsScreen';
import InstallGate from './components/InstallGate';
import DebugPanel from './components/DebugPanel';

import { getAccounts, addAccount, removeAccount } from './lib/db';
import { encryptPayload, decodeIdToken } from './lib/crypto';
import { logDebug } from './lib/debugLog';

// Bump this string on every deploy where we need to confirm the phone actually
// loaded the new bundle (PWAs cache aggressively via the service worker). It's
// logged to the Debug Panel on startup — if the panel doesn't show the expected
// value, the phone is running a stale cached build, not the latest deploy.
const BUILD_ID = 'build-2026-07-04-fullframe-scan';

const _isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const backendUrl = import.meta.env.VITE_BACKEND_URL
  ? (_isLocal ? import.meta.env.VITE_BACKEND_URL : (import.meta.env.VITE_BACKEND_URL === 'http://localhost:3001' ? 'https://labpass.onrender.com' : import.meta.env.VITE_BACKEND_URL))
  : (_isLocal ? 'http://localhost:3001' : 'https://labpass.onrender.com');
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
  const [scanError, setScanError] = useState(null);
  const [scanAttempt, setScanAttempt] = useState(0);
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

  const socketRef = useRef(null);
  const socket = useMemo(() => {
    const s = io(backendUrl, { transports: ['websocket'] });
    socketRef.current = s;
    return s;
  }, []);

  // Registers the events every socket needs to stay in sync with app state.
  // A QR can embed a non-default relay URL, in which case getSocketForUrl
  // below creates a brand new socket instance — it must get these same
  // listeners, or events on it (e.g. session-expired) go unheard.
  const attachCoreListeners = (s) => {
    s.off('login-approved');
    s.off('logout');
    s.off('session-expired');
    s.on('login-approved', (data) => {
      console.log('Login approved via socket', data);
      setRoute('sessions');
      setRouteHash('sessions');
    });
    s.on('logout', (data) => {
      console.log('Logout via socket', data);
      setSessions((prev) => prev.filter((x) => x.sessionToken !== data.sessionToken));
    });
    s.on('session-expired', (data) => {
      console.log('Session expired via socket', data);
      setSessions((prev) => prev.filter((x) => x.sessionToken !== data.sessionToken));
    });
  };

  // Helper: get or create a socket connected to a specific URL
  const getSocketForUrl = (url) => {
    if (!url || url === backendUrl) return socketRef.current;
    // If already connected to this url, reuse
    if (socketRef.current && socketRef.current.io && socketRef.current.io.uri === url && socketRef.current.connected) {
      return socketRef.current;
    }
    // Disconnect old socket if pointing elsewhere
    if (socketRef.current && socketRef.current.io && socketRef.current.io.uri !== url) {
      socketRef.current.disconnect();
    }
    const newSocket = io(url, { transports: ['websocket'] });
    attachCoreListeners(newSocket);
    socketRef.current = newSocket;
    return newSocket;
  };

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
    logDebug('PWA build:', BUILD_ID);
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
    attachCoreListeners(socket);

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
    logDebug('handleScanSuccess called with:', decodedText);
    const account = selectedAccount || (accounts.length === 1 ? accounts[0] : null);

    if (!account) {
      logDebug('No account selected, aborting scan handling');
      alert('Select an account before scanning.');
      navigateTo('setup');
      return;
    }

    let token = decodedText;
    let qrServerUrl = null;

    // Parse QR — extension encodes { token, server }
    try {
      const parsed = JSON.parse(decodedText);
      token = parsed.token || decodedText;
      qrServerUrl = parsed.server || null;
      logDebug('Parsed QR ->', { token, qrServerUrl });
    } catch {
      logDebug('QR content was not JSON, using raw text as token');
    }

    setScannedToken(token);

    // Use the server from the QR so we hit the same relay the extension is on
    const targetSocket = qrServerUrl ? getSocketForUrl(qrServerUrl) : socketRef.current;
    approveLogin(token, account, targetSocket);
  };

  // handleScanSuccess is a new function on every render, but ScannerScreen's
  // camera-init effect depends on the identity of onScanSuccess. Passing it
  // directly caused the camera to be torn down and restarted on every
  // App re-render (e.g. the 30s session-polling interval) while the user
  // was mid-scan, so decodes could be silently lost. This ref indirection
  // keeps the prop identity stable for the life of the component while
  // still always calling the latest closure.
  const handleScanSuccessRef = useRef(handleScanSuccess);
  handleScanSuccessRef.current = handleScanSuccess;
  const stableHandleScanSuccess = useCallback((decodedText) => {
    handleScanSuccessRef.current(decodedText);
  }, []);

  const approveLogin = (token, account, targetSocket) => {
    const activeSocket = targetSocket || socketRef.current;
    const payload = {
      email: account.email,
      displayName: account.displayName,
      pictureUrl: account.pictureUrl,
    };

    const emit = () => {
      activeSocket.timeout(8000).emit('login-approved', {
        sessionToken: token,
        email: account.email,
        displayName: account.displayName,
        pictureUrl: account.pictureUrl,
        encryptedPayload: encryptPayload(payload),
      }, (err, ack) => {
        logDebug('login-approved ack ->', err ? `timeout: ${err.message || err}` : ack);
        if (err || !ack || !ack.ok) {
          setScanError(
            err
              ? 'The lab computer did not respond in time. Please refresh the QR code and try again.'
              : 'This QR code has expired or is invalid. Please refresh the QR code on the lab computer and scan again.'
          );
          setScanAttempt((n) => n + 1);
          return;
        }

        setSelectedAccountEmail('');
        setScannedToken(null);
        setScanError(null);
        setRoute('sessions');
        setRouteHash('sessions');
      });
    };

    logDebug('approveLogin: socket connected?', activeSocket.connected, 'url:', activeSocket.io && activeSocket.io.uri);
    if (activeSocket.connected) {
      emit();
    } else {
      // Wait for connection then emit, but don't hang forever if the
      // relay is unreachable (e.g. wrong/blocked server URL).
      const connectTimer = setTimeout(() => {
        activeSocket.off('connect', onConnect);
        logDebug('approveLogin: socket never connected within 8s');
        setScanError('Could not reach the LabPass server. Check your connection and try again.');
        setScanAttempt((n) => n + 1);
      }, 8000);
      const onConnect = () => {
        clearTimeout(connectTimer);
        logDebug('approveLogin: socket connected, emitting now');
        emit();
      };
      activeSocket.once('connect', onConnect);
      activeSocket.connect();
    }
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
              setScanError(null);
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
            key={scanAttempt}
            onScanSuccess={stableHandleScanSuccess}
            onCancel={() => {
              setScannedToken(null);
              setScanError(null);
              setSelectedAccountEmail('');
              navigateTo('setup');
            }}
            selectedAccount={selectedAccount}
            loginError={scanError}
          />
        )}

      </main>
      <DebugPanel />
    </GoogleOAuthProvider>
  );
}