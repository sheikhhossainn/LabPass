const pwaUrl = import.meta.env.VITE_PWA_URL || 'http://localhost:5173';
const extensionUrl = import.meta.env.VITE_EXTENSION_URL || 'https://chrome.google.com/webstore/category/extensions';
const pwaLink = document.getElementById('pwa-link');
const extensionLink = document.getElementById('extension-link');
const desktopCallout = document.getElementById('desktop-callout');

pwaLink.href = pwaUrl;
pwaLink.textContent = `Open PWA (${pwaUrl})`;
extensionLink.href = extensionUrl;

const isDesktop = window.matchMedia('(min-width: 900px)').matches;
if (!isDesktop) {
	desktopCallout.querySelector('h3').textContent = 'On mobile right now?';
	desktopCallout.querySelector('p').textContent =
		'Use this page on the lab desktop to install the extension. On your phone, open the PWA link above to approve sessions.';
}