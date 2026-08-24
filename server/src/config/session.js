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
    sameSite: 'lax',
    maxAge: env.sessionMaxAgeMs,
  },
});

module.exports = { sessionMiddleware, SESSION_COOKIE_NAME };
