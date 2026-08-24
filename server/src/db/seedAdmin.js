// Production-safe bootstrap: creates exactly one ADMIN user from environment
// variables. Unlike seed.js (fake shops/transactions, refuses to run against
// production), this is the intended way to get a first working login on a
// freshly-migrated production database, which otherwise has no seed data at
// all (see database/migrations/0001_init.sql - inventory starts at zero,
// users starts empty).
//
// Usage (production):
//   ADMIN_NAME="Ibrahim Hassan" ADMIN_EMAIL="admin@yourdomain.example" \
//   ADMIN_PASSWORD="a-real-strong-password" npm run db:seed-admin --prefix server
//
// Safe to re-run: does nothing (and exits 0) if any user already exists,
// rather than silently creating a second admin or erroring.

const { pool } = require('../config/db');
const userService = require('../services/userService');

async function seedAdmin() {
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !password) {
    throw new Error(
      'Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD environment variables before running this script.'
    );
  }
  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
  }

  const { rows: existing } = await pool.query('SELECT id FROM users LIMIT 1');
  if (existing.length > 0) {
    console.log('Users already exist - skipping admin bootstrap (nothing to do).');
    return;
  }

  const user = await userService.createUser({ name, email, password, role: 'ADMIN' });
  console.log(`Created admin user: ${user.name} <${user.email}>`);
}

if (require.main === module) {
  seedAdmin()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { seedAdmin };
