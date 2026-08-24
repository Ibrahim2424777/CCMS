const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

const SAFE_COLUMNS = 'id, name, email, role, is_active, created_at, updated_at';

async function listUsers() {
  const { rows } = await pool.query(`SELECT ${SAFE_COLUMNS} FROM users ORDER BY name ASC`);
  return rows;
}

async function createUser({ name, email, password, role }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING ${SAFE_COLUMNS}`,
    [name, email, passwordHash, role]
  );
  return rows[0];
}

// Partial update: any field left as `undefined` keeps its current DB value.
// (`undefined` is normalized to `null` here because node-postgres rejects
// `undefined` as a bound parameter; COALESCE then falls back to the column.)
async function updateUser(id, { name, role, is_active }) {
  const { rows } = await pool.query(
    `UPDATE users SET
       name = COALESCE($1, name),
       role = COALESCE($2, role),
       is_active = COALESCE($3, is_active)
     WHERE id = $4
     RETURNING ${SAFE_COLUMNS}`,
    [name ?? null, role ?? null, is_active ?? null, id]
  );
  return rows[0] || null;
}

module.exports = { listUsers, createUser, updateUser };
