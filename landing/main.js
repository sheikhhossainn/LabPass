const pwaUrl = import.meta.env.VITE_PWA_URL || 'https://labpassmobile.vercel.app';
const extensionUrl = 'https://github.com/sheikhhossainn/LabPass/archive/refs/heads/main.zip';

document.querySelectorAll('#pwa-link, #pwa-nav-link').forEach(link => {
  link.href = pwaUrl;
});

document.querySelectorAll('#extension-link, #extension-nav-link').forEach(link => {
  link.href = extensionUrl;
});