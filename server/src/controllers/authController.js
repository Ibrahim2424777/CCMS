const authService = require('../services/authService');
const { SESSION_COOKIE_NAME } = require('../config/session');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    throw new HttpError(400, 'Email and password are required.', { code: 'VALIDATION_ERROR' });
  }

  const result = await authService.verifyCredentials(String(email).trim(), String(password));

  if (result.outcome === 'INVALID_CREDENTIALS') {
    throw new HttpError(401, 'Invalid email or password.', { code: 'INVALID_CREDENTIALS' });
  }
  if (result.outcome === 'ACCOUNT_DEACTIVATED') {
    throw new HttpError(401, 'This account has been deactivated. Contact an administrator.', {
      code: 'ACCOUNT_DEACTIVATED',
    });
  }

  // Regenerate the session on privilege change (login) to prevent session
  // fixation, then store only the minimal identity needed - role/status are
  // re-read from the DB on every request by requireAuth, never trusted from
  // the session alone.
  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

  req.session.userId = result.user.id;

  await new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

  res.json({ data: authService.toSafeUser(result.user) });
});

const logout = asyncHandler(async (req, res) => {
  if (!req.session) {
    return res.status(204).end();
  }

  await new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });

  res.clearCookie(SESSION_COOKIE_NAME);
  res.status(204).end();
});

// requireAuth has already loaded req.user from the DB.
const me = asyncHandler(async (req, res) => {
  res.json({ data: req.user });
});

module.exports = { login, logout, me };
