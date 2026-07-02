import React from 'react';
import { useGoogleLogin } from '@react-oauth/google';

export default function HomeScreen({ accounts, onAddAccount, onRemoveAccount, onStartScan, onViewSessions }) {
  const login = useGoogleLogin({
    onSuccess: onAddAccount,
    onError: () => console.error('Login Failed')
  });

  return (
    <section className="panel identities animate-in">
      <div className="panel-head">
        <h2>Setup</h2>
        <span className="pill">On-device encrypted</span>
      </div>

      <p className="setup-lead">Pick a saved account first, then open the scanner to read the QR from the lab PC extension.</p>

      <div className="identity-list">
        {accounts.length === 0 ? (
          <>
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)', marginBottom: '8px' }}>
                <path d="M8 4H5a2 2 0 0 0-2 2v3"/><path d="M16 4h3a2 2 0 0 1 2 2v3"/><path d="M8 20H5a2 2 0 0 1-2-2v-3"/><path d="M16 20h3a2 2 0 0 0 2-2v-3"/>
                <circle cx="10" cy="10" r="1.5" fill="currentColor"/><circle cx="14" cy="14" r="1.5" fill="currentColor"/>
              </svg>
              <p>No accounts added yet. Add an account to get started.</p>
            </div>
            
            <div className="process-strip">
              <div className="process-step">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 4H5a2 2 0 0 0-2 2v3"/><path d="M16 4h3a2 2 0 0 1 2 2v3"/><path d="M8 20H5a2 2 0 0 1-2-2v-3"/><path d="M16 20h3a2 2 0 0 0 2-2v-3"/>
                  <circle cx="12" cy="11" r="2"/><path d="M9 16v-1a3 3 0 0 1 6 0v1"/>
                </svg>
                <span>Sign In</span>
              </div>
              <span className="process-arrow">→</span>
              <div className="process-step">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 4H5a2 2 0 0 0-2 2v3"/><path d="M16 4h3a2 2 0 0 1 2 2v3"/><path d="M8 20H5a2 2 0 0 1-2-2v-3"/><path d="M16 20h3a2 2 0 0 0 2-2v-3"/>
                  <path d="M9 12l2 2 4-4"/>
                </svg>
                <span>Encrypt</span>
              </div>
              <span className="process-arrow">→</span>
              <div className="process-step">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 4H5a2 2 0 0 0-2 2v3"/><path d="M16 4h3a2 2 0 0 1 2 2v3"/><path d="M8 20H5a2 2 0 0 1-2-2v-3"/><path d="M16 20h3a2 2 0 0 0 2-2v-3"/>
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
                </svg>
                <span>Scan</span>
              </div>
            </div>
          </>
        ) : (
          accounts.map((account) => (
            <article key={account.email} className="identity-item">
              <div className="avatar">
                {account.pictureUrl ? (
                  <img src={account.pictureUrl} alt={account.displayName} referrerPolicy="no-referrer" />
                ) : (
                  <span>{account.displayName.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="identity-body">
                <h3>{account.displayName}</h3>
                <p>{account.email}</p>
              </div>
              <div className="identity-actions">
                <button
                  className="scan-account-btn"
                  onClick={() => onStartScan(account)}
                >
                  Scan with this account
                </button>
                <button 
                  className="icon-btn danger" 
                  onClick={() => onRemoveAccount(account.email)}
                  title="Remove account"
                >
                  ✕
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="google-login-wrap">
        <p className="trust-statement">Sign in once. We never see your password.</p>
        <button className="google-signin-btn" onClick={() => login()}>
          <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="currentColor"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="currentColor"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="currentColor"/>
          </svg>
          Continue to Google
        </button>
      </div>

      <div className="how-to-use-card">
        <h3>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-a)' }}>
            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
          </svg>
          How to use LabPass
        </h3>
        <ol className="how-to-use-steps">
          <li>
            <strong>Add Accounts:</strong> Sign in using <em>Continue to Google</em> below to save your most used lab computer accounts securely on this device.
          </li>
          <li>
            <strong>Select Profile:</strong> When you want to sign in at a lab PC, click the <em>"Scan with this account"</em> button on your desired account.
          </li>
          <li>
            <strong>Scan QR Code:</strong> Point your camera at the QR code generated by the Lab PC Chrome Extension. This will automatically open the <strong>back camera</strong> of your phone.
          </li>
          <li>
            <strong>Instant Sign-In:</strong> Once successfully scanned, you will be instantly logged in to the lab computer!
          </li>
        </ol>
      </div>

      {accounts.length > 1 && (
        <p className="setup-lead" style={{ marginTop: '8px' }}>
          Choose one account above to begin scanning.
        </p>
      )}

      {accounts.length === 1 && (
        <button className="scan-fab animate-in" onClick={() => onStartScan(accounts[0])}>
          Scan with this account
        </button>
      )}

      <button className="btn-secondary w-full mt-4" onClick={onViewSessions}>
        View Sessions
      </button>
    </section>
  );
}
