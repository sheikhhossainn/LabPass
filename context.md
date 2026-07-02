# LabPass — Project Context

> QR-based quick login/logout for shared university lab computers.
> PWA (phone) + Chrome Extension (lab PC) + Relay Server architecture.

---

## Architecture Overview

```
┌─────────────┐    WebSocket     ┌──────────────┐    WebSocket     ┌─────────────────┐
│  Chrome Ext  │ ◄──────────────► │ Relay Server │ ◄──────────────► │   PWA (Phone)   │
│  (Lab PC)    │   socket.io     │  (Node/PG)   │   socket.io     │  React + Vite   │
└─────────────┘                  └──────────────┘                  └─────────────────┘
     │                                  │                                   │
     │ Shows QR code                    │ Manages sessions (CRUD)           │ Scans QR
     │ Receives login-approved          │ Expires stale sessions            │ Sends login-approved
     │ Receives logout                  │ Broadcasts logout/expiry          │ Sends logout
     │ Clears cookies on logout         │ PostgreSQL persistence            │ Stores identities
     └─────────────────────────────────►│◄──────────────────────────────────┘
```

---

## Monorepo Structure

```
LabPass/
├── package.json          # Workspace root — npm scripts proxy into subpackages
├── server/               # HTTPS + WebSocket relay server (Node.js, Express, Socket.IO, pg)
│   ├── index.js          # Entry: Express routes + Socket.IO event handlers
│   └── src/
│       ├── env.js        # dotenv loader
│       ├── db.js         # PostgreSQL pool, query helpers, schema init
│       └── sessionStore.js  # In-memory session map with expiry timers
├── pwa/                  # Mobile PWA (React 18, Vite, vite-plugin-pwa)
│   ├── vite.config.js    # Vite + PWA manifest config
│   ├── index.html        # SPA shell
│   └── src/
│       ├── main.jsx      # Entry: SW registration + React render
│       ├── App.jsx       # Single-file app: identities, QR scanner, sessions, logout
│       ├── styles.css    # Light-theme mobile-first styling
│       └── lib/          # (empty — reserved for utils)
├── landing/              # Product landing page (vanilla HTML/CSS/JS, Vite)
│   ├── index.html        # Hero + "How it works" + CTA links
│   ├── main.js           # Dynamic PWA/extension URL injection
│   ├── styles.css        # Dark glassmorphism theme
│   └── vite.config.js    # Vite dev server on port 3002
└── (NO extension/ dir)   # ❌ Chrome extension does NOT exist yet
```

---

## Tech Stack

| Layer       | Tech                                                      | Port  |
|-------------|-----------------------------------------------------------|-------|
| Server      | Node.js, Express, Socket.IO, PostgreSQL (`pg`), `uuid`   | 3001  |
| PWA         | React 18, Vite 5, `html5-qrcode`, `@react-oauth/google`, `socket.io-client`, `vite-plugin-pwa` | 5173  |
| Landing     | Vanilla HTML/CSS/JS, Vite                                 | 3002  |
| Extension   | **Not started**                                           | —     |
| Transport   | HTTPS + WSS (self-signed certs via `selfsigned`)          |       |
| DB          | PostgreSQL (sessions table with status/expiry)            |       |

---

## What's Built (✅) vs. What's Missing (❌)

### Server (`server/`) — ~70% done
| Feature | Status | Notes |
|---------|--------|-------|
| Express HTTPS server with self-signed certs | ✅ | Requires `.certs/` dir |
| Socket.IO WebSocket relay | ✅ | WSS-only transport |
| `POST /session/create` — creates pending session | ✅ | Returns sessionToken + pcId |
| `GET /sessions/active` — lists active sessions | ✅ | Filters by status + expiry |
| `qr-generated` event — binds socket to session | ✅ | Extension → server |
| `login-approved` event — activates session | ✅ | PWA → server → extension |
| `logout` event — clears session | ✅ | PWA → server → extension |
| `session-expired` event — auto-expiry broadcast | ✅ | Timer-based (3hr active, 60s pending) |
| In-memory session store with timer management | ✅ | Map-based, synced to PG |
| PostgreSQL schema init + query helpers | ✅ | `sessions` table with indexes |
| Rate limiting (120 req / 15min) | ✅ | `express-rate-limit` |
| CORS headers | ✅ | Wildcard — needs tightening |
| Input validation (pcId, sessionToken, payloads) | ✅ | UUID regex, length checks |
| **User/identity management** | ❌ | No users table, no auth, no linking accounts to sessions |
| **OAuth token relay** | ❌ | `encryptedPayload` is accepted but not validated/decrypted |
| **Per-user session association** | ❌ | Sessions track pcId only, not which user/account |
| **CORS lockdown for production** | ❌ | Currently `Access-Control-Allow-Origin: *` |
| **Tests** | ❌ | No unit/integration tests |

### PWA (`pwa/`) — ~40% done
| Feature | Status | Notes |
|---------|--------|-------|
| React SPA with Vite | ✅ | Hot reload, dev server on 0.0.0.0 |
| Service Worker registration (PWA) | ✅ | `vite-plugin-pwa` with autoUpdate |
| PWA manifest (name, theme, standalone) | ✅ | Missing icons |
| QR scanner via `html5-qrcode` | ✅ | Opens on "Scan to login" tap |
| Socket.IO connection to server | ✅ | Sends `login-approved`, `logout` |
| Google OAuth button (GSI) | ✅ | `@react-oauth/google` — triggers scan flow |
| Hardcoded identity list (uni + personal) | ✅ | Static, not from real OAuth |
| Active sessions list from API | ✅ | Fetches on mount |
| Logout button per session | ✅ | Emits `logout` via socket |
| Mobile-first UI with gradient accent | ✅ | Light theme, card layout |
| **Real identity management (add/remove Google accounts)** | ❌ | Identities are hardcoded |
| **Secure token storage (encrypted on-device)** | ❌ | No IndexedDB/crypto, placeholder payload |
| **Session-to-identity binding in UI** | ❌ | Can't pick which account to log in with |
| **Proper routing (scan screen, sessions screen, home)** | ❌ | All in one component, toggled by `screen` state |
| **Offline support / caching strategy** | ❌ | SW registered but no offline UI |
| **PWA icons & splash screens** | ❌ | Manifest has empty icons array |
| **Error handling & loading states** | ❌ | No feedback on failures |
| **Polish / animations** | ❌ | Functional but basic |

### Chrome Extension — ❌ NOT STARTED
| Feature | Status | Notes |
|---------|--------|-------|
| `manifest.json` (MV3) | ❌ | No extension directory exists |
| Extension popup with QR code display | ❌ | Core feature |
| Background service worker | ❌ | For session management, cookie clearing |
| `POST /session/create` call on popup open | ❌ | Gets sessionToken → encodes to QR |
| Socket.IO connection (listen for `login-approved`) | ❌ | Receives encrypted payload |
| Cookie injection / profile switching | ❌ | The hardest part — Chrome identity APIs |
| Automatic cookie/session clearing on `logout` | ❌ | `chrome.browsingData` / `chrome.cookies` |
| Idle detection → auto-logout | ❌ | `chrome.idle` API |
| Extension options page | ❌ | PC name config, server URL |
| Extension icon & branding | ❌ | — |

### Landing Page (`landing/`) — ~90% done
| Feature | Status | Notes |
|---------|--------|-------|
| Hero section with tagline | ✅ | "Scan to login. Tap to logout." |
| "How it works" 3-step grid | ✅ | Install → Scan → Logout |
| CTA links (PWA + Chrome extension) | ✅ | URLs from `.env` |
| Responsive layout (desktop + mobile callout) | ✅ | Dynamic text swap |
| Dark glassmorphism theme | ✅ | Polished |
| Footer with GitHub link | ✅ | Placeholder URL |
| **Actual Chrome Web Store link** | ❌ | Points to generic store URL |
| **Animations / scroll effects** | ❌ | Static |

---

## Key Environment Variables

| Package  | Variable              | Purpose                          |
|----------|-----------------------|----------------------------------|
| `server` | `PORT`                | HTTPS server port (default 3001) |
| `server` | `HTTPS_KEY_PATH`      | Path to TLS private key          |
| `server` | `HTTPS_CERT_PATH`     | Path to TLS certificate          |
| `server` | `DATABASE_URL`        | PostgreSQL connection string     |
| `pwa`    | `VITE_BACKEND_URL`    | Server URL for API + WS          |
| `pwa`    | `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID         |
| `landing`| `VITE_PWA_URL`        | PWA URL for CTA link             |

---

## Data Model (PostgreSQL)

```sql
sessions (
  id          BIGSERIAL PRIMARY KEY,
  pc_id       TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (IN ('pending','active','expired','logged_out')),
  created_at  TIMESTAMPTZ NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL
)
-- Indexes: (status, expires_at), (pc_id)
```

**Missing columns:** `user_id`, `account_email`, `encrypted_token`, `lab_name`, `course`.

---

## Session Lifecycle

```
Extension opens popup
    → POST /session/create { pcId }
    → Server returns { sessionToken, expiresAt }  (status: pending, TTL: 60s)
    → Extension encodes sessionToken as QR code
    → Extension emits 'qr-generated' { sessionToken } via WebSocket
    → Server binds socket to session

Student scans QR on phone PWA
    → PWA decodes sessionToken from QR
    → PWA emits 'login-approved' { sessionToken, encryptedPayload }
    → Server updates session to 'active' (TTL: 3 hours)
    → Server forwards 'login-approved' to extension's socket
    → Extension receives payload → (TODO: inject cookies/profile)

Student taps Logout in PWA
    → PWA emits 'logout' { sessionToken }
    → Server updates session to 'logged_out'
    → Server forwards 'logout' to extension's socket
    → Extension receives → (TODO: clear cookies/profile)

Session expires (timeout)
    → Server timer fires → emits 'session-expired' to extension
    → Extension receives → (TODO: clear cookies/profile)
```

---

## Completion Assessment

| Component       | Progress | Blocking Issues |
|-----------------|----------|-----------------|
| **Server**      | 70%      | No user model, no real token handling |
| **PWA**         | 40%      | Hardcoded identities, no real OAuth flow, no proper routing |
| **Extension**   | 0%       | Entirely missing — this is the other half of the product |
| **Landing**     | 90%      | Cosmetic only — needs real store link |
| **Overall**     | **~35%** | Extension is 0% and is the most complex piece |

### Critical Path to MVP
1. **Build the Chrome Extension** — popup QR display, socket listener, cookie management
2. **Implement real OAuth flow** in PWA — actual Google tokens, not placeholders
3. **Wire encrypted token relay** — extension receives and uses real credentials
4. **Add user/identity persistence** — server-side user model, PWA IndexedDB
5. **Cookie/session injection** on lab PC — the actual "login" mechanism
6. **End-to-end testing** across all three components
