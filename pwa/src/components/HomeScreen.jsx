import React from 'react';
import { GoogleLogin } from '@react-oauth/google';

export default function HomeScreen({ accounts, onAddAccount, onRemoveAccount, onScanClick }) {
  return (
    <section className="panel identities animate-in">
      <div className="panel-head">
        <h2>Saved Identities</h2>
        <span className="pill">On-device encrypted</span>
      </div>

      <div className="identity-list">
        {accounts.length === 0 ? (
          <div className="empty-state">
            <p>No accounts added yet. Add an account to get started.</p>
          </div>
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
              <button 
                className="icon-btn danger" 
                onClick={() => onRemoveAccount(account.email)}
                title="Remove account"
              >
                ✕
              </button>
            </article>
          ))
        )}
      </div>

      <div className="google-login-wrap">
        <GoogleLogin
          onSuccess={(credentialResponse) => onAddAccount(credentialResponse)}
          onError={() => console.error('Login Failed')}
          useOneTap
        />
      </div>

      <button className="scan-fab" onClick={onScanClick}>
        Scan to Login
      </button>
    </section>
  );
}
