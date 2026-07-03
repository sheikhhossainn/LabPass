const listeners = new Set();
let logs = [];

function format(args) {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

export function logDebug(...args) {
  const entry = `${new Date().toLocaleTimeString()}  ${format(args)}`;
  logs = [...logs, entry].slice(-300);
  listeners.forEach((l) => l(logs));
  console.log(...args);
}

export function subscribeDebugLog(listener) {
  listeners.add(listener);
  listener(logs);
  return () => listeners.delete(listener);
}

export function clearDebugLogs() {
  logs = [];
  listeners.forEach((l) => l(logs));
}
