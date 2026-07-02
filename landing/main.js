const pwaUrl = import.meta.env.VITE_PWA_URL || 'http://localhost:5173';
const extensionUrl = 'https://github.com/sheikhhossainn/LabPass/archive/refs/heads/main.zip';

const pwaLink = document.getElementById('pwa-link');
const extensionLink = document.getElementById('extension-link');

pwaLink.href = pwaUrl;
extensionLink.href = extensionUrl;