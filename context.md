# LabPass — Project Context

QR-based quick login/logout for shared university lab computers.  
PWA (phone) + Chrome Extension (lab PC) + Relay Server (socket.io).

**Latest (v1.2)**: Fixed silent QR scan failures — server now verifies the extension's socket is actually alive before acking success, extension self-heals its socket after MV3 kills the service worker, PWA no longer thrashes the camera mid-scan, and extension popup refreshes QR display every 20s to keep it fresh.

**v1.1**: Fixed QR timeout (60s→5min), added login-approved acks with retry, error banner, auto-update PWA.

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

## Current Fixes (v1.2)

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| **Scan acks "success" but PC never logs in** | `server/index.js` relayed `login-approved` to `session.socketId` and always acked `{ok:true}` regardless of whether that socket was still connected — a dead extension socket meant the emit silently went nowhere while the phone was told it worked. | Server now looks up `io.sockets.sockets.get(session.socketId)` and only acks success if it's actually connected; otherwise acks `{ok:false, error:...}`, which the PWA already knew how to show as a banner (`server/index.js:371-377`). |
| **Extension socket dies while QR is still on screen** | Chrome MV3 kills the background service worker after ~30s idle, dropping the socket. The pending (not-yet-scanned) session only lived in memory, so a SW restart had nothing to reconnect — the QR looked valid (5min TTL) but was orphaned. | Pending sessions now persist to `chrome.storage.local` immediately on creation. Added a `chrome.alarms`-based watchdog (`ensureConnection`, `background.js:263-298`) that survives SW death and rebinds the socket for pending or active sessions. Requires the `alarms` permission (`manifest.json`). |
| **Camera looks fine but scanning a QR never does anything** | `ScannerScreen`'s camera-init `useEffect` depends on `onScanSuccess` (`ScannerScreen.jsx:89`). `App.jsx` passed `handleScanSuccess` — a new function every render — so the 30s session-polling interval (or any other state change) tore down and recreated the whole `Html5Qrcode` instance mid-scan, silently killing in-flight decodes. | `App.jsx` now passes a ref-backed stable wrapper (`stableHandleScanSuccess`) so the prop identity never changes; the camera only restarts on the intentional `key={scanAttempt}` remount (error/retry), not on unrelated re-renders. |
| **PWA hangs forever if the relay is unreachable** | `approveLogin`'s `else` branch waited on a `'connect'` event with no timeout — if the socket could never connect (bad URL, blocked transport), nothing ever happened, no error shown. | Added an 8s timeout that surfaces "Could not reach the LabPass server" if `connect` never fires (`App.jsx:approveLogin`). |
| **Non-default relay URL in QR could silently drop events** | `getSocketForUrl` can create a brand-new socket for a QR-embedded relay URL different from the app's default, but `login-approved`/`logout`/`session-expired` listeners were only ever attached to the original default socket. | Extracted `attachCoreListeners(s)`, called for both the default socket and any dynamically created one (`App.jsx`). |
| **"Scan with this account" button wraps onto 2-3 lines** | Button was squeezed in horizontal row alongside avatar/name/remove. Text overflow on mobile. | Restacked: avatar/name/remove in `identity-row`, full-width button below (`HomeScreen.jsx`, `styles.css`). |
| **PWA installed on home screen never updates** | `registerSW` set immediate: true but had empty `onNeedRefresh`. New SW was fetched only on full relaunch; page kept old JS until manual reload. | Added: listener on `controllerchange` event triggers `window.location.reload()` to sync running page with new SW. Added hourly poll via `registration.update()` so long-lived sessions pick up releases (fixed `main.jsx`). |

## Integrations

- **PWA install**: `beforeinstallprompt`/`appinstalled` hooks in App.jsx. Native prompt (Android) or iOS guide modal.
- **Session cleanup cron**: `GET /session/cleanup` (Express) called by cron-job.org every 10min. Doubles as a Render free-tier keep-alive — Render spins down web services after 15min of no inbound traffic, so the 10min interval also prevents cold starts (which previously ate into the QR's 5min TTL on the first request after a sleep).
- **Extension idle logout**: `chrome.idle.onStateChanged` triggers `chrome.browsingData.remove()`.
- **Extension distribution**: Currently "Load unpacked" (manual reload). Auto-update requires Chrome Web Store or enterprise policy (not yet implemented).
