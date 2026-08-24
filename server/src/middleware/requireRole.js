const HttpError = require('../utils/httpError');

// Must run after requireAuth (needs req.user to already be populated).
function requireRole(role) {
  return function roleCheck(req, res, next) {
    if (!req.user || req.user.role !== role) {
      return next(new HttpError(403, 'You do not have permission to perform this action.', { code: 'FORBIDDEN' }));
    }
    next();
  };
}

module.exports = requireRole;
