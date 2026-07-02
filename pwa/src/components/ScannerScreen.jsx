import React, { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function ScannerScreen({ onScanSuccess, onCancel }) {
  const scannerRef = useRef(null);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner('qr-reader', {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
      showTorchButtonIfSupported: true,
    }, false);

    scanner.render(
      (decodedText) => {
        scanner.clear();
        onScanSuccess(decodedText);
      },
      (error) => {
        // Ignored, happens continuously when no QR code is detected
      }
    );

    scannerRef.current = scanner;

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
      }
    };
  }, [onScanSuccess]);

  return (
    <section className="panel scanner-panel animate-in">
      <div className="panel-head">
        <h2>Scan QR Code</h2>
        <button className="icon-btn" onClick={onCancel}>✕</button>
      </div>
      <div id="qr-reader" className="qr-reader-container"></div>
      <p className="scanner-hint">Point your camera at the lab computer screen</p>
    </section>
  );
}
