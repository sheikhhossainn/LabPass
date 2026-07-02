import React, { useState } from 'react';

export default function InstallPrompt({ deferredPrompt, isIOS, isStandalone, onClose }) {
  const [dismissed, setDismissed] = useState(false);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      alert("Please open your browser menu (the three dots icon in Chrome or Safari share button) and select 'Add to Home screen' or 'Install App' to install LabPass manually.");
      onClose();
      return;
    }
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    onClose();
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('installPromptDismissed', 'true');
    onClose();
  };

  if (isStandalone || dismissed) {
    return null;
  }

  return (
    <div className="install-prompt-overlay animate-in">
      <div className="install-prompt-card">
        <button className="close-btn" onClick={handleDismiss} aria-label="Dismiss">✕</button>
        
        <div className="install-prompt-content">
          <div className="install-icon">
            <img src="/logo-animated.svg" alt="LabPass" width="48" height="48" />
          </div>
          <div className="install-text">
            <h3>Install LabPass</h3>
            <p>Add to your home screen for quick access to lab computers.</p>
          </div>
        </div>

        {isIOS && !deferredPrompt ? (
          <div className="ios-instructions">
            <p>To install on iOS:</p>
            <ol>
              <li>Tap the <strong>Share</strong> button <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{verticalAlign: 'middle', margin: '0 4px'}}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> below</li>
              <li>Scroll down and select <strong>Add to Home Screen</strong> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{verticalAlign: 'middle', margin: '0 4px'}}><rect x="3" y="3" width="18" height="18" rx="4" ry="4"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></li>
            </ol>
          </div>
        ) : (
          <button className="btn-primary w-full mt-4" onClick={handleInstallClick}>
            Install App
          </button>
        )}
      </div>
    </div>
  );
}
