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
├── package.json          # Workspace root — npm scripts (concurrently dev:all)
├── server/               # HTTPS + WebSocket relay server (Express, Socket.IO, @libsql/client)
│   ├── index.js          # Entry: Express routes + Socket.IO event handlers
│   └── src/
│       ├── env.js        # dotenv loader
│       ├── db.js         # Turso/LibSQL client, schema init
│       └── sessionStore.js # In-memory session map with expiry timers
├── pwa/                  # Mobile PWA (React 18, Vite, vite-plugin-pwa)
│   ├── index.html        # SPA shell with PWA meta tags
│   └── src/
│       ├── App.jsx       # Multi-screen router (home, scan, sessions)
│       ├── styles.css    # Premium dark emerald theme + animations
│       ├── components/   # HomeScreen, ScannerScreen, SessionsScreen, AccountPicker
│       └── lib/          # db.js (IndexedDB) & crypto.js (encryption/JWT)
├── landing/              # Product landing page (vanilla HTML/CSS/JS, Vite)
└── extension/            # Chrome Extension (Lab PC gatekeeper)
    ├── manifest.json     # MV3, permissions (cookies, browsingData, idle)
    ├── popup.js/html/css # UI for QR display & states
    ├── background.js     # Socket listener, idle detection, auto-cleanup
    ├── options.html      # Config (PC Name, Server URL, timeout)
    └── lib/              # Bundled socket.io.min.js & qrcode.min.js
```

---

## Visual Design & Branding

LabPass uses a custom-tailored **Dark Emerald / Vercel-style theme** across both PWA and Landing interfaces:
- **Palette**: `#030504` background (pitch black with slight green tint), `#0a1410` primary panels/cards, `#0f1d17` elevated panels, `#10b981` emerald text/glow highlights.
- **Branding**: Monogram **"P"** logo containing a negative-space checkmark (`#34d6a6`).
- **Animations**:
  - `logo-animated.svg`: Custom glow-filtered loading animation (growing stem, rotating bowl, drawing checkmark).
  - Landing Hero: Interactive SVG diagram simulating live PC-to-Phone connections with pulsing spark vectors.
  - PWA Splash: Loading splash logo auto-scales up to `220px` on phone viewports to dominate focus.

---

## Tech Stack

| Layer       | Tech                                                      |
|-------------|-----------------------------------------------------------|
| Server      | Node.js, Express, Socket.IO, `@libsql/client`, Helmet     |
| PWA         | React 18, Vite 5, `html5-qrcode`, `@react-oauth/google`   |
| Landing     | Vanilla HTML/CSS/JS, Vite                                 |
| Extension   | Manifest V3, pure JavaScript, Socket.IO client            |
| DB          | Turso (LibSQL / SQLite)                                   |

---

## Completed Implementations (✅)

### Server (`server/`)
- Express server with Helmet security and CORS lockdown.
- WebSocket relay with keepalive mechanism.
- CRUD sessions persistence via **Turso / LibSQL**.
- Automated SQL database migrations for user logging.

### PWA (`pwa/`)
- IndexedDB dynamically stores Google profiles on-device.
- Real Google OAuth authentication.
- Customized dark Google Sign-in button with monochrome vector logo.
- Emerald gradient action FAB ("Scan to Login") with high-contrast text.

### Landing Page (`landing/`)
- Sleek hero design featuring animated visual mockup layout.
- Quick Actions Navbar: "Get Extension" and "Open App" smooth scroll to bottom.
- Footer CTA Card: Unified action downloads with step-by-step Chrome installation guide.

### Chrome Extension (`extension/`)
- MV3 popup generates QR connection tokens.
- **Auto-Cleanup**: Uses `chrome.browsingData.remove()` to wipe cookie/storage on logout.
- **Idle Detection**: Detects user inactivity and clears active credentials automatically.
