# LabPass — Project Context

> QR-based quick login/logout for shared university lab computers.
> PWA (phone) + Chrome Extension (lab PC) + Relay Server architecture.

---

## Architecture Overview

```text
┌─────────────┐    WebSocket     ┌──────────────┐    WebSocket     ┌─────────────────┐
│  Chrome Ext │ ◄──────────────► │ Relay Server │ ◄──────────────► │   PWA (Phone)   │
│  (Lab PC)   │   socket.io      │  (Node/LibSQL)│   socket.io     │  React + Vite   │
└─────────────┘                  └──────────────┘                  └─────────────────┘
     │                                  │                                   │
     │ Shows QR code                    │ Manages sessions (CRUD)           │ Scans QR
     │ Receives login-approved          │ Expires stale sessions            │ Sends login-approved
     │ Receives logout                  │ Broadcasts logout/expiry          │ Sends logout
     │ Clears browsing data on logout   │ Turso / LibSQL persistence        │ Stores identities (IndexedDB)
     └─────────────────────────────────►│◄──────────────────────────────────┘
```

---

## Monorepo Structure

```text
LabPass/
├── LICENSE               # MIT License (Sheikh Hossain Bin Bakhtiar)
├── context.md            # Project Context & Design System State (Token-optimized)
├── package.json          # Workspace root — npm scripts (concurrently dev:all)
├── server/               # HTTPS + WebSocket relay server (Express, Socket.IO, @libsql/client)
│   ├── index.js          # Entry: Express routes, cron `/session/cleanup` endpoint, socket handlers
│   └── src/
│       ├── db.js         # Turso/LibSQL client, schema initialization
│       └── sessionStore.js # In-memory session tracking
├── pwa/                  # Mobile PWA (React 18, Vite, IndexedDB storage)
│   ├── src/
│   │   ├── App.jsx       # App shell, PWA install prompt hooks, router
│   │   ├── styles.css    # Premium dark emerald theme + responsive splash layout
│   │   └── components/   # HomeScreen, ScannerScreen, SessionsScreen, InstallPrompt
├── landing/              # Product landing page (Vite, vanilla HTML/CSS/JS)
└── extension/            # Chrome Extension (Lab PC gatekeeper)
    ├── manifest.json     # MV3, cookies, browsingData, idle permissions
    └── background.js     # Service worker, idle triggers, cookie/browsing data deletion
```

---

## Brand Design & Visual System

LabPass uses a **Dark Emerald / Vercel-style theme** across all platforms:
- **Palette**: `#030504` background (pitch black with slight green tint), `#0a1410` cards, `#0f1d17` elevated boxes, `#10b981` / `#34d6a6` emerald green brand accent.
- **Branding**: Monogram **"P"** logo checkmark SVG (`logo.svg`), set as the unified favicon across PWA, Extension Options/Popup, and Landing sections.
- **Mobile-Responsive Adjustments**:
  - **Connection Lines**: Stacking cards on mobile triggers Y-axis vertical lines and spark animations (`spark-flow-vertical`) instead of horizontal X-axis sparks.
  - **Hamburger Drawer**: Desktop links collapse into an animated, centered mobile dropdown menu drawer with consistent row spacing.
  - **Navbar Spacing**: Links use `display: inline-flex` and `gap: 8px` with stripped HTML whitespace to align icon-text boundaries precisely.
  - **Splash screen**: The monogram logo auto-centers on all screens and scales to `220px` on mobile viewports.

---

## Key Integrations

### 1. PWA Installation Action Trigger
- Monitors standalone display modes and device agents (detects iOS/Android).
- Exposes a persistent **"Install"** action button in the PWA topbar when run from browsers.
- Automatically launches native install prompt (Android) or shows a step-by-step modal guide (iOS) to encourage home-screen usage.

### 2. Cron Cleanup Endpoint
- Express server exposes a `GET /session/cleanup` route at `https://labpass.onrender.com`.
- Triggers a database sweep to prune expired sessions. Integrated with cron-job.org scheduled requests (running every 15 minutes).

### 3. Extension Security & Lifecycle
- Connects automatically to the relay server to download session tokens and render QR codes.
- Wipes browsing cookies/history using `chrome.browsingData.remove()` immediately on session expiration or logout.
- Utilizes `chrome.idle` to trigger automatic logouts on PC inactivity.
