import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { logDebug } from '../lib/debugLog';

// html5-qrcode calls this on every failed decode attempt (up to `fps` times/sec),
// so log a throttled heartbeat instead of spamming — this is the only way to see
// whether the scan loop is actually running and what it's seeing (nothing in
// frame vs. a code it can't quite decode) when a scan silently "does nothing".
function makeThrottledScanErrorLogger(label) {
  let count = 0;
  let lastLogAt = 0;
  return (message) => {
    count += 1;
    const now = Date.now();
    if (now - lastLogAt > 3000) {
      lastLogAt = now;
      logDebug(`[${label}] scan attempts so far: ${count}, last message:`, message);
    }
  };
}

function logTrackSettings(html5QrCode, label) {
  try {
    const settings = html5QrCode.getRunningTrackSettings();
    logDebug(`[${label}] camera track settings:`, settings);
  } catch (err) {
    logDebug(`[${label}] could not read track settings:`, err.message || err);
  }
}

// Passing `videoConstraints` makes html5-qrcode use it as the entire
// getUserMedia constraints, replacing (not merging with) whatever facingMode
// config was passed as the first start() argument — so facingMode has to live
// in here too. Also requests a real resolution instead of letting the library's
// `aspectRatio: 1.0` force a tiny cropped 480x480 square, which was too low-res
// for the decoder to ever find the QR code in frame.
function buildVideoConstraints(exact) {
  return {
    facingMode: exact ? { exact: 'environment' } : { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };
}

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

        const scanErrorLogger = makeThrottledScanErrorLogger('main');

        const launch = async (videoConstraints) => {
          await html5QrCode.start(
            { facingMode: "environment" },
            {
              fps: 10,
              // No qrbox: scan the FULL camera frame. A fixed 250x250 qrbox only
              // decodes a tiny central crop of the 1080x1920 feed — a QR on a
              // screen easily overflows or falls outside that region, so it was
              // never detected despite a perfect, focused camera image.
              videoConstraints,
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
            scanErrorLogger
          );
        };

        try {
          await launch(buildVideoConstraints(isMobileDevice));
        } catch (firstErr) {
          logDebug('Exact environment constraint failed, trying fallback:', firstErr.message || firstErr);
          await launch(buildVideoConstraints(false));
        }

        isScanningRef.current = true;
        setLoading(false);
        setError(null);
        logDebug('Camera started, scanning for QR...');
        logTrackSettings(html5QrCode, 'main');
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

      const scanErrorLogger = makeThrottledScanErrorLogger('retry');

      const launch = (videoConstraints) => {
        return html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            // No qrbox — scan the full frame (see note in the main launch above).
            videoConstraints,
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
          scanErrorLogger
        );
      };

      launch(buildVideoConstraints(isMobileDevice))
      .then(() => {
        isScanningRef.current = true;
        setLoading(false);
        logTrackSettings(html5QrCode, 'retry');
      })
      .catch((err) => {
        logDebug('Failed with exact constraint on retry, trying fallback:', err.message || err);
        launch(buildVideoConstraints(false))
        .then(() => {
          isScanningRef.current = true;
          setLoading(false);
          logTrackSettings(html5QrCode, 'retry-fallback');
        })
        .catch((fallbackErr) => {
          logDebug('Error starting scanner on retry:', fallbackErr.message || fallbackErr);
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
