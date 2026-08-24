const app = require('./src/app');
const env = require('./src/config/env');
const { pool } = require('./src/config/db');

const server = app.listen(env.port, () => {
  console.log(`CCMS API listening on port ${env.port} [${env.nodeEnv}]`);
});

// Render (and most PaaS hosts) send SIGTERM before stopping/restarting a
// container for a redeploy - without this, in-flight requests get dropped
// and the DB pool's connections are left dangling instead of closed cleanly.
function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);
  server.close(async (err) => {
    if (err) {
      console.error('Error while closing HTTP server:', err);
      process.exitCode = 1;
    }
    try {
      await pool.end();
    } catch (poolErr) {
      console.error('Error while closing DB pool:', poolErr);
      process.exitCode = 1;
    }
    process.exit();
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
