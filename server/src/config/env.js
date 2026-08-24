const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const REQUIRED_VARS = ['DATABASE_URL', 'SESSION_SECRET'];

for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}. Copy server/.env.example to server/.env and fill it in.`);
  }
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  databaseUrl: process.env.DATABASE_URL,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  dbSsl: process.env.DB_SSL === 'true',
  sessionSecret: process.env.SESSION_SECRET,
  sessionMaxAgeMs: parseInt(process.env.SESSION_MAX_AGE_MS, 10) || 12 * 60 * 60 * 1000, // 12h default
};

module.exports = env;
