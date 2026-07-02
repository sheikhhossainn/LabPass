const pcIdInput = document.getElementById('pc-id');
const serverUrlInput = document.getElementById('server-url');
const idleTimeoutSelect = document.getElementById('idle-timeout');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-btn');
const toast = document.getElementById('toast');

const DEFAULTS = {
  pcId: 'Lab-PC-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
  serverUrl: 'https://labpass.onrender.com',
  idleTimeout: 60,
};

// Load saved settings
chrome.storage.sync.get(['pcId', 'serverUrl', 'idleTimeout'], (config) => {
  let serverUrl = config.serverUrl;
  if (serverUrl === 'http://localhost:3001') {
    serverUrl = DEFAULTS.serverUrl;
  }
  pcIdInput.value = config.pcId || DEFAULTS.pcId;
  serverUrlInput.value = serverUrl || DEFAULTS.serverUrl;
  idleTimeoutSelect.value = String(config.idleTimeout || DEFAULTS.idleTimeout);
});

function showToast() {
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

saveBtn.addEventListener('click', () => {
  const pcId = pcIdInput.value.trim() || DEFAULTS.pcId;
  const serverUrl = serverUrlInput.value.trim() || DEFAULTS.serverUrl;
  const idleTimeout = parseInt(idleTimeoutSelect.value, 10) || DEFAULTS.idleTimeout;

  chrome.storage.sync.set({ pcId, serverUrl, idleTimeout }, () => {
    showToast();
    chrome.idle.setDetectionInterval(idleTimeout * 60);
  });
});

resetBtn.addEventListener('click', () => {
  pcIdInput.value = DEFAULTS.pcId;
  serverUrlInput.value = DEFAULTS.serverUrl;
  idleTimeoutSelect.value = String(DEFAULTS.idleTimeout);
});
