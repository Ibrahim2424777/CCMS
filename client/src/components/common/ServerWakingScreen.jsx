import { useSyncExternalStore } from 'react';
import { isWaking, subscribeToWaking } from '../../api/serverWake';

// Covers the app while the backend wakes up, so a visitor sees why they're
// waiting instead of a login error. Requests resume by themselves afterwards.
export function ServerWakingScreen() {
  const waking = useSyncExternalStore(subscribeToWaking, isWaking);

  if (!waking) return null;

  return (
    <div className="centered-shell server-waking d-flex align-items-center justify-content-center" role="status">
      <div className="text-center">
        <div className="spinner-border mb-4" aria-hidden="true" />
        <h1 className="server-waking-title mb-2">Waking up the server&hellip;</h1>
        <p className="server-waking-note mb-0">This takes about 30 seconds after the site has been idle.</p>
      </div>
    </div>
  );
}
