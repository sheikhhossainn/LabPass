/**
 * LabPass Extension — Popup Script
 *
 * Handles: session creation, QR code display, socket events,
 * and communicates with the background service worker.
 */

/* ── DOM References ── */
const $ = (sel) => document.querySelector(sel);
const states = {
  loading: $('#state-loading'),
  qr: $('#state-qr'),
  waiting: $('#state-waiting'),
  active: $('#state-active'),
  error: $('#state-error'),
};

const qrCanvas = $('#qr-canvas');
const timerFill = $('#timer-fill');
const timerCountdown = $('#timer-countdown');
const pcNameDisplay = $('#pc-name-display');
const activeEmail = $('#active-email');
const activeExpires = $('#active-expires');
const statusDot = $('#status-dot');
const statusText = $('#status-text');
const logoutBtn = $('#logout-btn');
const retryBtn = $('#retry-btn');
const settingsBtn = $('#settings-btn');
const errorMessage = $('#error-message');

/* ── State ── */
let currentSessionToken = null;
let countdownInterval = null;

/* ── Helpers ── */

function showState(name) {
  Object.values(states).forEach((el) => el.classList.remove('active'));
  if (states[name]) {
    states[name].classList.add('active');
  }
}

function setStatus(type, text) {
  statusDot.className = 'status-dot' + (type ? ' ' + type : '');
  statusText.textContent = text;
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function startCountdown(expiresAt) {
  clearInterval(countdownInterval);
  const expiry = new Date(expiresAt).getTime();
  const total = expiry - Date.now();

  countdownInterval = setInterval(() => {
    const remaining = Math.max(0, expiry - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    timerCountdown.textContent = seconds;
    timerFill.style.width = ((remaining / total) * 100) + '%';

    if (remaining <= 0) {
      clearInterval(countdownInterval);
      initSession(); // regenerate
    }
  }, 1000);
}

function generateQR(text) {
  // Uses the bundled qrcode.min.js (QRCode global from qrcode-generator)
  if (typeof QRCode === 'undefined') {
    console.error('QRCode library not loaded');
    return;
  }

  const qr = QRCode(0, 'M');
  qr.addData(text);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const size = 200;
  const cellSize = size / moduleCount;
  const ctx = qrCanvas.getContext('2d');

  qrCanvas.width = size;
  qrCanvas.height = size;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#0b1120';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        const x = col * cellSize;
        const y = row * cellSize;
        ctx.beginPath();
        ctx.roundRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1, 1);
        ctx.fill();
      }
    }
  }
}

/* ── Session Management ── */

async function getConfig() {
  const defaults = {
    pcId: 'Lab-PC-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
    serverUrl: 'http://localhost:3001',
    idleTimeout: 60,
  };

  try {
    const stored = await chrome.storage.sync.get(['pcId', 'serverUrl', 'idleTimeout']);
    return { ...defaults, ...stored };
  } catch {
    return defaults;
  }
}

async function initSession() {
  showState('loading');
  clearInterval(countdownInterval);

  try {
    const config = await getConfig();
    pcNameDisplay.textContent = config.pcId;

    const response = await fetch(`${config.serverUrl}/session/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pcId: config.pcId }),
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    const data = await response.json();
    currentSessionToken = data.sessionToken;

    // Tell background to connect and listen for this session
    chrome.runtime.sendMessage({
      type: 'SESSION_CREATED',
      sessionToken: data.sessionToken,
      expiresAt: data.expiresAt,
      pcId: config.pcId,
      serverUrl: config.serverUrl,
    });

    // Generate and show QR
    generateQR(JSON.stringify({
      token: data.sessionToken,
      server: config.serverUrl,
    }));

    showState('qr');
    setStatus('connected', 'Connected to server');
    startCountdown(data.expiresAt);

  } catch (err) {
    console.error('Session init failed:', err);
    errorMessage.textContent = err.message || 'Could not reach the LabPass server.';
    showState('error');
    setStatus('error', 'Disconnected');
  }
}

/* ── Listen for messages from background ── */

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'LOGIN_APPROVED': {
      showState('active');
      clearInterval(countdownInterval);
      activeEmail.textContent = message.email || 'Unknown account';
      activeExpires.textContent = formatTime(message.expiresAt || new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString());
      setStatus('connected', 'Session active');
      break;
    }

    case 'SESSION_EXPIRED':
    case 'LOGGED_OUT': {
      currentSessionToken = null;
      initSession(); // reset to new QR
      break;
    }

    case 'SOCKET_CONNECTED': {
      setStatus('connected', 'Connected to server');
      break;
    }

    case 'SOCKET_DISCONNECTED': {
      setStatus('error', 'Reconnecting…');
      break;
    }
  }
});

/* ── Check if there's an existing active session ── */

async function checkExistingSession() {
  try {
    const stored = await chrome.storage.local.get(['activeSession']);
    if (stored.activeSession && stored.activeSession.sessionToken) {
      const session = stored.activeSession;
      const now = Date.now();
      const expires = new Date(session.expiresAt).getTime();

      if (expires > now) {
        // Session still valid
        currentSessionToken = session.sessionToken;
        activeEmail.textContent = session.email || 'Unknown account';
        activeExpires.textContent = formatTime(session.expiresAt);
        showState('active');
        setStatus('connected', 'Session active');
        return true;
      } else {
        // Expired, clean up
        await chrome.storage.local.remove('activeSession');
      }
    }
  } catch {
    // ignore
  }
  return false;
}

/* ── Event Listeners ── */

logoutBtn.addEventListener('click', () => {
  if (currentSessionToken) {
    chrome.runtime.sendMessage({
      type: 'LOGOUT',
      sessionToken: currentSessionToken,
    });
  }
});

retryBtn.addEventListener('click', () => {
  initSession();
});

settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

/* ── Init ── */

(async () => {
  const config = await getConfig();
  pcNameDisplay.textContent = config.pcId;

  const hasSession = await checkExistingSession();
  if (!hasSession) {
    await initSession();
  }
})();
