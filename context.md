# LabPass — Project Context

QR-based quick login/logout for shared university lab computers.  
PWA (phone) + Chrome Extension (lab PC) + Relay Server (socket.io).

**Latest (v1.1)**: Fixed QR timeout (60s→5min), added login-approved acks with retry, error banner, auto-update PWA.

## Architecture

```
Chrome Ext ◄──ws──► Relay Server ◄──ws──► PWA (React)
  (Lab PC)   socket  (Express)   socket   (Vite+PWA)
   • QR      • Sessions (CRUD)    • Scans
   • Idle    • Turso/LibSQL       • IndexedDB
```

---

## Layout

| Dir | Role |
|-----|------|
| `server/` | Node + Express + Socket.IO + Turso (CRUD sessions, cleanup cron) |
| `pwa/src/` | React + Vite. **App.jsx** (router, socket, login-approved ack). **components/** (HomeScreen, ScannerScreen, SessionsScreen). **main.jsx** (registerSW auto-update: hourly poll + reload on controller change). **styles.css** (dark emerald, responsive mobile). |
| `extension/` | MV3 background.js (QR gen, idle logout, data wipe). popup.js/html (session UI, countdown). |
| `landing/` | Static Vite site. |

---

## Design

**Dark Emerald theme**: `#030504` bg, `#0a1410` cards, `#10b981`/`#34d6a6` accent. **P-checkmark SVG logo** (favicon unified across PWA/Ext/Landing). **Mobile**: full-width buttons (no pill wrapping), Y-axis spark animations, hamburger drawer, 220px splash logo.

---

## Current Fixes (v1.1)

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| **Scan appears to work but PC doesn't login** | QR token TTL was 60s; by the time user picked account + opened camera, session was expired server-side. PWA never checked socket ack, so silently navigated away. | QR TTL: 60s→5min (`server/index.js:23`). `App.jsx:approveLogin` now uses `.timeout(8000).emit('login-approved', ..., callback)` with error handling + retry (shows banner). |
| **"Scan with this account" button wraps onto 2-3 lines** | Button was squeezed in horizontal row alongside avatar/name/remove. Text overflow on mobile. | Restacked: avatar/name/remove in `identity-row`, full-width button below (`HomeScreen.jsx`, `styles.css`). |
| **PWA installed on home screen never updates** | `registerSW` set immediate: true but had empty `onNeedRefresh`. New SW was fetched only on full relaunch; page kept old JS until manual reload. | Added: listener on `controllerchange` event triggers `window.location.reload()` to sync running page with new SW. Added hourly poll via `registration.update()` so long-lived sessions pick up releases (fixed `main.jsx`). |

## Integrations

- **PWA install**: `beforeinstallprompt`/`appinstalled` hooks in App.jsx. Native prompt (Android) or iOS guide modal.
- **Session cleanup cron**: `GET /session/cleanup` (Express) called by cron-job.org every 15min.
- **Extension idle logout**: `chrome.idle.onStateChanged` triggers `chrome.browsingData.remove()`.
- **Extension distribution**: Currently "Load unpacked" (manual reload). Auto-update requires Chrome Web Store or enterprise policy (not yet implemented).
