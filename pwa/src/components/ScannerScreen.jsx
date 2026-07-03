import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { logDebug } from '../lib/debugLog';

export default function ScannerScreen({ onScanSuccess, onCancel, selectedAccount, loginError }) {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(loginError || null);
  const qrCodeRef = useRef(null);
  const isScanningRef = useRef(false);

  useEffect(() => {
    if (!loginError) return;
    setBanner(loginError);
    const timer = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(timer);
  }, [loginError]);

  useEffect(() => {
    // Instantiate Html5Qrcode directly to bypass default controls UI
    const html5QrCode = new Html5Qrcode('qr-reader');
    qrCodeRef.current = html5QrCode;

    const startScanner = async () => {
      try {
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        let config = { facingMode: "environment" };
        if (isMobileDevice) {
          config = { facingMode: { exact: "environment" } };
        }
        
        const launch = async (cameraConfig) => {
          await html5QrCode.start(
            cameraConfig,
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0,
            },
            (decodedText) => {
              logDebug('QR decoded:', decodedText, 'isScanning:', isScanningRef.current);
              if (isScanningRef.current) {
                isScanningRef.current = false;
                html5QrCode.stop()
                  .then(() => onScanSuccess(decodedText))
                  .catch((err) => {
                    console.error('Failed to stop scanner on success:', err);
                    onScanSuccess(decodedText);
                  });
              }
            },
            () => {}
          );
        };

        try {
          await launch(config);
        } catch (firstErr) {
          logDebug('Exact environment constraint failed, trying fallback:', firstErr.message || firstErr);
          await launch({ facingMode: "environment" });
        }

        isScanningRef.current = true;
        setLoading(false);
        setError(null);
        logDebug('Camera started, scanning for QR...');
      } catch (err) {
        logDebug('Error starting scanner:', err.message || err);
        isScanningRef.current = false;
        setLoading(false);
        setError(
          'Could not open camera. Please ensure camera permissions are granted and no other application is using the camera.'
        );
      }
    };

    // Delay start slightly to let the DOM element mount completely
    const timer = setTimeout(() => {
      startScanner();
    }, 100);

    return () => {
      clearTimeout(timer);
      if (qrCodeRef.current && isScanningRef.current) {
        isScanningRef.current = false;
        qrCodeRef.current.stop().catch((err) => {
          console.error('Error stopping scanner on cleanup:', err);
        });
      }
    };
  }, [onScanSuccess]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    const html5QrCode = qrCodeRef.current;
    if (html5QrCode) {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      let config = { facingMode: "environment" };
      if (isMobileDevice) {
        config = { facingMode: { exact: "environment" } };
      }

      const launch = (cameraConfig) => {
        return html5QrCode.start(
          cameraConfig,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            logDebug('QR decoded:', decodedText, 'isScanning:', isScanningRef.current);
            if (isScanningRef.current) {
              isScanningRef.current = false;
              html5QrCode.stop()
                .then(() => onScanSuccess(decodedText))
                .catch((err) => {
                  console.error('Failed to stop scanner on success:', err);
                  onScanSuccess(decodedText);
                });
            }
          },
          () => {}
        );
      };

      launch(config)
      .then(() => {
        isScanningRef.current = true;
        setLoading(false);
      })
      .catch((err) => {
        console.warn('Failed with exact constraint on retry, trying fallback:', err);
        launch({ facingMode: "environment" })
        .then(() => {
          isScanningRef.current = true;
          setLoading(false);
        })
        .catch((fallbackErr) => {
          console.error('Error starting scanner on retry:', fallbackErr);
          isScanningRef.current = false;
          setLoading(false);
          setError('Camera access failed. Please check permissions.');
        });
      });
    }
  };

  return (
    <section className="panel scanner-panel animate-in">
      <div className="panel-head">
        <h2>Scan QR Code</h2>
        <button className="icon-btn" onClick={onCancel}>✕</button>
      </div>

      {selectedAccount && (
        <div className="scanner-account-chip">
          Using {selectedAccount.displayName}
        </div>
      )}

      {banner && (
        <div className="scanner-error-banner">{banner}</div>
      )}

      <div className="qr-reader-container" style={{ position: 'relative', minHeight: '260px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        {loading && (
          <div style={{ position: 'absolute', color: 'var(--accent-a)', fontWeight: '600', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <span className="spinner"></span>
            <span>Initializing Camera...</span>
          </div>
        )}
        
        {error && (
          <div style={{ position: 'absolute', padding: '20px', textAlign: 'center', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: 'var(--danger)', fontSize: '2rem' }}>⚠️</span>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: '1.4', margin: 0 }}>{error}</p>
            <button className="btn-secondary" onClick={handleRetry} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>Retry Connection</button>
          </div>
        )}

        <div id="qr-reader" style={{ width: '100%', borderRadius: '12px', overflow: 'hidden', display: error ? 'none' : 'block' }}></div>
      </div>
      
      <p className="scanner-hint" style={{ marginTop: '12px' }}>Point your camera at the QR code generated on the lab computer extension</p>
    </section>
  );
}
