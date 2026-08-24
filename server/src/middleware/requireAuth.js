const authService = require('../services/authService');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');

// Loads the current user fresh from the database on every request (rather
// than trusting whatever role/status was true when the session was created).
// This is deliberate: sessions were chosen over JWT specifically so that
// deactivating a user takes effect immediately (see ARCHITECTURE.md section 6)
// - that guarantee only holds if we re-check is_active on every request.
const requireAuth = asyncHandler(async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    throw new HttpError(401, 'You must be logged in to do that.', { code: 'NOT_AUTHENTICATED' });
  }

  const user = await authService.findUserById(req.session.userId);

  if (!user || !user.is_active) {
    req.session.destroy(() => {});
    throw new HttpError(401, 'Your session is no longer valid. Please log in again.', { code: 'SESSION_INVALID' });
  }

  req.user = user;
  next();
});

module.exports = requireAuth;
