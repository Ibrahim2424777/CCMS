// Render's free tier puts the backend to sleep after 15 minutes idle, and while
// it sleeps Render answers requests arriving through the Cloudflare proxy
// (functions/api/[[path]].js) with an instant 429 ("hibernate-rate-limited")
// instead of waking it - the request never reaches the app, and retrying
// through the proxy never helps. A request sent straight from the visitor's
// own browser does wake it, so that's what happens here. Update this URL
// alongside BACKEND_ORIGIN in the proxy if the Render service URL ever changes.
const BACKEND_WAKE_URL = 'https://ccms-v3ov.onrender.com/';

const POLL_INTERVAL_MS = 2000;
const WAKE_TIMEOUT_MS = 120000;

let wakePromise = null;
const listeners = new Set();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function subscribeToWaking(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isWaking() {
  return wakePromise !== null;
}

// The app's own 429 (the login rate limiter) always carries a JSON error body,
// so a 429 without one came from the hosting layer and never reached the app.
export function isHibernationResponse(response) {
  return response?.status === 429 && !response.data?.error;
}

async function pollUntilAwake(healthUrl) {
  const deadline = Date.now() + WAKE_TIMEOUT_MS;
  let wakeRequestInFlight = false;

  while (Date.now() < deadline) {
    if (!wakeRequestInFlight) {
      wakeRequestInFlight = true;
      // no-cors: only the request arriving matters, not reading the reply
      // (the API's Cross-Origin-Resource-Policy makes that fail regardless).
      fetch(BACKEND_WAKE_URL, { mode: 'no-cors', cache: 'no-store' })
        .catch(() => {})
        .finally(() => {
          wakeRequestInFlight = false;
        });
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(healthUrl, { cache: 'no-store' });
      if (response.ok) return true;
    } catch {
      // Still starting up - keep polling until the deadline.
    }
  }

  return false;
}

// Resolves true once the backend answers through the proxy, false on timeout.
// Concurrent callers (a page firing several requests at once) share one wake.
export function wakeServer(healthUrl) {
  if (!wakePromise) {
    wakePromise = pollUntilAwake(healthUrl).finally(() => {
      wakePromise = null;
      notifyListeners();
    });
    notifyListeners();
  }
  return wakePromise;
}
