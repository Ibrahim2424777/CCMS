const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

// A precomputed bcrypt hash of an unused value, compared against when no
// user is found so login takes roughly the same time whether or not the
// email exists - avoids leaking account existence via response timing.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Yo.7chFRQyF/ZuBK6cHjWEZUZzP5m';

async function findUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] || null;
}

async function findUserById(id) {
  const { rows } = await pool.query(
    'SELECT id, name, email, role, is_active FROM users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

// Returns { outcome: 'OK', user } | { outcome: 'INVALID_CREDENTIALS' } | { outcome: 'ACCOUNT_DEACTIVATED', user }
async function verifyCredentials(email, password) {
  const user = await findUserByEmail(email);
  const passwordMatches = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

  if (!user || !passwordMatches) {
    return { outcome: 'INVALID_CREDENTIALS' };
  }
  if (!user.is_active) {
    return { outcome: 'ACCOUNT_DEACTIVATED', user };
  }
  return { outcome: 'OK', user };
}

function toSafeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
  };
}

module.exports = { findUserByEmail, findUserById, verifyCredentials, toSafeUser };
