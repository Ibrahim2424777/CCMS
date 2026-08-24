const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// Slows down credential-guessing without locking out a small shared-office team.
// Only failed attempts count - a legitimately busy login endpoint should never
// lock itself out just because many people successfully signed in.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: { message: 'Too many login attempts. Please try again later.', code: 'RATE_LIMITED' } },
});

router.post('/login', loginLimiter, authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);

module.exports = router;
