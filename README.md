# LabPass

LabPass is a comprehensive solution for shared computer labs (like university labs) to allow quick, passwordless login using your phone via a QR code. It replaces the tedious process of typing credentials and ensures privacy by automatically logging you out when you leave.

## Components

The system is composed of three main parts:

### 1. LabPass Server (`/server`)
A fast Express & Socket.IO backend that acts as a real-time relay between the phone and the lab PC.
- **Database:** Uses Turso/LibSQL for fast, edge-ready data storage (SQLite).
- **Security:** Helmet enabled, CORS restricted, JWT ID Token validation (via Google).

### 2. LabPass PWA (`/pwa`)
A progressive web app installed on the student's phone.
- **Features:** Stores Google accounts securely in IndexedDB, scans QR codes using the camera, and approves logins.
- **Tech Stack:** React, Vite, Google Identity Services.

### 3. LabPass Chrome Extension (`/extension`)
Installed on the shared lab computer.
- **Features:** Generates a unique QR code for the session, listens for real-time approval via WebSockets, and automatically clears cookies/browsing data on logout or idle.
- **Tech Stack:** Manifest V3, pure JavaScript.

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- A [Turso](https://turso.tech/) account (for the database)
- Google Cloud Console project with an OAuth 2.0 Client ID

### 1. Backend Setup
```bash
cd server
cp .env.example .env
npm install
npm run dev
```

### 2. PWA Setup
```bash
cd pwa
cp .env.example .env
# Edit .env with your Google Client ID and Server URL
npm install
npm run dev
```

### 3. Extension Setup
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `extension` folder
4. Click on the extension icon to view the generated QR code.

## Running the whole stack locally
You can use the root `package.json` to start the frontend, landing page, and backend simultaneously:

```bash
npm install
npm run dev
```

## Security & Privacy
- **Automatic Cleanup:** When a session ends or the computer goes idle, the extension purges all browsing data (cookies, cache, local storage).
- **No Password Entry:** Passwords are never typed on the shared computer, neutralizing keyloggers.
- **Encrypted Payloads:** Communication between the phone and the extension goes over secure WebSockets with payload encryption.
