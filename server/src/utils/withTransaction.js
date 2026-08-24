const { pool } = require('../config/db');

// Runs fn(client) inside BEGIN/COMMIT, rolling back on any error. Centralizes
// the transaction boilerplate so money- and inventory-affecting operations
// (MASTER CONTEXT section 13) can never partially apply.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = withTransaction;
