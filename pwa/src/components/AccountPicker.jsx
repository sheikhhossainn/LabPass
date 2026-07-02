import React from 'react';

export default function AccountPicker({ accounts, onSelect, onCancel }) {
  return (
    <div className="modal-overlay animate-in">
      <div className="modal-content">
        <h2>Select Account</h2>
        <p>Which account do you want to log in with?</p>
        
        <div className="account-picker-list">
          {accounts.map(account => (
            <button 
              key={account.email} 
              className="account-picker-item"
              onClick={() => onSelect(account)}
            >
              <div className="avatar">
                {account.pictureUrl ? (
                  <img src={account.pictureUrl} alt={account.displayName} referrerPolicy="no-referrer" />
                ) : (
                  <span>{account.displayName.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="account-details">
                <strong>{account.displayName}</strong>
                <span>{account.email}</span>
              </div>
            </button>
          ))}
        </div>
        
        <button className="btn-secondary w-full mt-4" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
