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
├── server/               # HTTPS + WebSocket relay server (Node.js, Express, Socket.IO, @libsql/client)
│   ├── index.js          # Entry: Express routes + Socket.IO event handlers
│   └── src/
│       ├── env.js        # dotenv loader
│       ├── db.js         # Turso/LibSQL client, schema init
│       └── sessionStore.js # In-memory session map with expiry timers
├── pwa/                  # Mobile PWA (React 18, Vite, vite-plugin-pwa)
│   ├── index.html        # SPA shell with PWA meta tags
│   └── src/
│       ├── App.jsx       # Multi-screen router (home, scan, sessions)
│       ├── styles.css    # Premium dark theme + animations
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

## Tech Stack

| Layer       | Tech                                                      |
|-------------|-----------------------------------------------------------|
| Server      | Node.js, Express, Socket.IO, `@libsql/client`, Helmet     |
| PWA         | React 18, Vite 5, `html5-qrcode`, `@react-oauth/google`   |
| Landing     | Vanilla HTML/CSS/JS, Vite                                 |
| Extension   | Manifest V3, pure JavaScript, Socket.IO client            |
| DB          | Turso (LibSQL / SQLite)                                   |

---

## What's Built (✅) — 100% Core MVP Complete

### Server (`server/`)
- Express server with Helmet security and CORS lockdown via `ALLOWED_ORIGINS`.
- Socket.IO WebSocket relay with keepalive mechanism.
- `POST /session/create`, `GET /sessions/active`, `GET /session/:token/status`.
- Database rewritten from PostgreSQL to **Turso / LibSQL**.
- Users table created automatically, upserts users on login using Google ID tokens.
- Unit tests added (`npm test`) using Node's built-in test runner.

### PWA (`pwa/`)
- Multi-screen React app (Home, Scanner, Sessions, Account Picker).
- Real **Google OAuth** flow via GSI (`@react-oauth/google`).
- **IndexedDB** securely stores users' saved Google accounts locally.
- QR scanner using `html5-qrcode`.
- Emits login-approved via sockets; displays active sessions dynamically.
- Premium dark theme (Slate & Indigo) with micro-animations.

### Chrome Extension (`extension/`)
- MV3 popup generates and displays a QR code containing the session token.
- Background worker maintains a Socket.IO connection (with 20s keepalive).
- **Auto-Cleanup:** Listens for `logout` or `session-expired` and uses `chrome.browsingData.remove()` to wipe all data (cookies, localStorage, cache).
- **Idle Detection:** Auto-logs out if the PC is left unattended.
- Options page to configure the PC name and idle timeout.

---

## Key Environment Variables

| Package  | Variable              | Purpose                                           |
|----------|-----------------------|---------------------------------------------------|
| `server` | `PORT`                | HTTPS server port (default 3001)                  |
| `server` | `TURSO_DATABASE_URL`  | URL to Turso DB (e.g. `libsql://...` or `file:...`) |
| `server` | `TURSO_AUTH_TOKEN`    | Auth token for remote Turso DB                    |
| `server` | `ALLOWED_ORIGINS`     | Comma-separated allowed CORS origins              |
| `pwa`    | `VITE_BACKEND_URL`    | Server URL for API + WS                           |
| `pwa`    | `VITE_GOOGLE_CLIENT_ID`| Google OAuth client ID                            |

---

## Session Lifecycle

1. **Extension opens popup**
   → Creates session, generates QR, binds socket (`status: pending`, TTL: 60s).
2. **Student scans QR via PWA**
   → Decodes token, optionally picks Google Account.
   → Emits `login-approved` with Google Profile payload.
   → Server updates session to `active` (TTL: 3 hours) and broadcasts to extension.
3. **Student taps Logout in PWA (or Idle timeout hits)**
   → Emits `logout`. Server broadcasts to extension.
   → Extension receives `logout` and completely wipes Chrome browsing data.
