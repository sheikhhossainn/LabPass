const pwaEnv = import.meta.env || {};
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const defaultPwaUrl = isLocal ? 'http://localhost:5173' : 'https://labpassmobile.vercel.app';
const pwaUrl = isLocal ? 'http://localhost:5173' : (pwaEnv.VITE_PWA_URL || defaultPwaUrl);
const extensionUrl = 'https://github.com/sheikhhossainn/LabPass/archive/refs/heads/main.zip';

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Bind links
document.querySelectorAll('#pwa-link, #pwa-nav-link').forEach(link => {
  link.href = pwaUrl;
});

document.querySelectorAll('#extension-link, #extension-nav-link').forEach(link => {
  link.href = extensionUrl;
});

// Set QR code src dynamically for desktop users
const qrImg = document.getElementById('pwa-qr-img');
if (qrImg) {
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&color=10b981&bgcolor=ffffff&qzone=2&data=${encodeURIComponent(pwaUrl)}`;
}

// Keep the nav 'Open App' CTA as a scroll-to-download action.
document.querySelectorAll('.nav-btn-app').forEach(link => {
  link.href = '#download';
  link.removeAttribute('target');
});

// Mobile Hamburger Navigation Toggle
const menuToggle = document.getElementById('menu-toggle');
const navRight = document.getElementById('nav-right');

if (menuToggle && navRight) {
  menuToggle.addEventListener('click', () => {
    menuToggle.classList.toggle('active');
    navRight.classList.toggle('active');
  });

  // Close menu when clicking links
  navRight.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      menuToggle.classList.remove('active');
      navRight.classList.remove('active');
    });
  });
}