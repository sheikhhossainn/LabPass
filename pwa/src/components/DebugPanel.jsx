import React, { useEffect, useState } from 'react';
import { subscribeDebugLog, clearDebugLogs } from '../lib/debugLog';

export default function DebugPanel() {
  const [logs, setLogs] = useState([]);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => subscribeDebugLog(setLogs), []);

  const copyLogs = async () => {
    const text = logs.length ? logs.join('\n') : 'No logs yet.';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — nothing we can do here.
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
          padding: '10px 14px', borderRadius: 999, background: '#10b981',
          color: '#031006', border: 'none', fontWeight: 700, fontSize: '0.8rem',
          boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
        }}
      >
        Debug ({logs.length})
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed', inset: '8% 4%', zIndex: 9999,
        background: '#0a1410', color: '#d7fff0', border: '1px solid #10b981',
        borderRadius: 14, display: 'flex', flexDirection: 'column', padding: 12,
        boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ color: '#34d6a6' }}>Debug Log</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={copyLogs} style={btnStyle}>{copied ? 'Copied!' : 'Copy'}</button>
          <button onClick={clearDebugLogs} style={btnStyle}>Clear</button>
          <button onClick={() => setOpen(false)} style={btnStyle}>Close</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {logs.length === 0 ? 'No logs yet — try scanning.' : logs.join('\n')}
      </div>
    </div>
  );
}

const btnStyle = {
  padding: '6px 10px', borderRadius: 8, background: '#10241c',
  color: '#d7fff0', border: '1px solid #1f5b46', fontSize: '0.75rem',
};
