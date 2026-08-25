// Cloudflare Pages Function: proxies every /api/* request to the real
// backend (Render), so the browser only ever talks to one origin
// (ccms-4k9.pages.dev). This exists specifically to fix cross-browser login
// failures: with the frontend and backend on genuinely different domains,
// the session cookie is a "third-party" cookie from the browser's point of
// view, and Safari/Firefox/Chrome increasingly block or partition those by
// default regardless of the SameSite attribute - login would appear to
// succeed and then immediately bounce back out. Proxying makes every
// request and its Set-Cookie response same-origin, which every browser
// treats as an ordinary first-party cookie with no special-casing at all.
//
// BACKEND_ORIGIN intentionally hardcoded rather than an env var: Pages
// Functions environment variables are a separate concept from the Vite
// build-time variables already used elsewhere in this project, and adding
// a second configuration mechanism for one fixed value isn't worth the
// indirection. Update this string if the Render service URL ever changes.
const BACKEND_ORIGIN = 'https://ccms-v3ov.onrender.com';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const backendUrl = BACKEND_ORIGIN + url.pathname + url.search;

  // Cloning via `new Request(url, request)` carries over method, headers,
  // and body unchanged; fetch() sets the correct outbound Host itself.
  const backendRequest = new Request(backendUrl, request);
  return fetch(backendRequest);
}
