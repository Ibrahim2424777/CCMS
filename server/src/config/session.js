const session = require('express-session');
const pgSessionFactory = require('connect-pg-simple');
const { pool } = require('./db');
const env = require('./env');

const pgSession = pgSessionFactory(session);

// Cookie/table name kept distinct from the express-session default
// ("connect.sid") so it's obviously ours in devtools/DB inspection.
const SESSION_COOKIE_NAME = 'ccms.sid';

const sessionMiddleware = session({
  store: new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  name: SESSION_COOKIE_NAME,
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true, // active use extends the session instead of a hard expiry
  cookie: {
    httpOnly: true,
    secure: env.nodeEnv === 'production', // secure cookies require HTTPS, unavailable on local http://
    // The production frontend (Cloudflare Pages) and backend (Render) are on
    // different registrable domains - a genuinely cross-site request from the
    // browser's point of view, even with CORS configured correctly. Browsers
    // withhold a SameSite=Lax cookie from cross-site XHR/fetch calls, so the
    // session cookie set at login never comes back on the next request,
    // silently bouncing the user back to the login page. SameSite=None (only
    // valid paired with Secure, which is already on in production) is
    // required for this specific split-domain deployment shape. Local dev
    // keeps 'lax' since localhost:5173 and localhost:5000 count as the same
    // site there, and 'none' without 'secure' would be rejected outright by
    // the browser over local http://.
    sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
    maxAge: env.sessionMaxAgeMs,
  },
});

module.exports = { sessionMiddleware, SESSION_COOKIE_NAME };
