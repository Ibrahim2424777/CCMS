const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const { sessionMiddleware } = require('./config/session');
const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const shopsRouter = require('./routes/shops');
const transactionsRouter = require('./routes/transactions');
const inventoryRouter = require('./routes/inventory');
const analyticsRouter = require('./routes/analytics');

const app = express();

// Behind a reverse proxy/load balancer in production, req.ip and req.secure
// would otherwise resolve to the proxy itself rather than the real client -
// silently breaking the login rate limiter (everyone would share one bucket)
// and secure-cookie/HTTPS detection. Only trusted when actually deployed
// that way; local dev has no proxy in front of it, so this is a no-op there.
if (env.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());
app.use(sessionMiddleware);

app.get('/', (req, res) => {
  res.json({ name: 'CCMS API', status: 'running' });
});

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/shops', shopsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/analytics', analyticsRouter);

// 404 for unmatched API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } });
});

// Centralized error handler - never leak raw stack traces to clients (MC section 28).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);

  // body-parser marks its own errors "expose: true" (the general convention
  // for 4xx errors), which would otherwise leak its raw parser message -
  // including a fragment of the actual submitted body - straight to the
  // client. Map known parser error types to clean, human-readable messages
  // instead (MC section 22: "return useful human-readable errors").
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { message: 'Request body is not valid JSON.', code: 'INVALID_JSON' },
    });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: { message: 'Request body is too large.', code: 'PAYLOAD_TOO_LARGE' },
    });
  }

  res.status(err.status || 500).json({
    error: {
      message: err.expose ? err.message : 'An unexpected error occurred.',
      code: err.code || 'INTERNAL_ERROR',
    },
  });
});

module.exports = app;
