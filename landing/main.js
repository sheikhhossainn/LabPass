const pwaUrl = import.meta.env.VITE_PWA_URL || 'https://labpassmobile.vercel.app';
const extensionUrl = 'https://github.com/sheikhhossainn/LabPass/archive/refs/heads/main.zip';

document.querySelectorAll('#pwa-link, #pwa-nav-link').forEach(link => {
  link.href = pwaUrl;
});

document.querySelectorAll('#extension-link, #extension-nav-link').forEach(link => {
  link.href = extensionUrl;
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