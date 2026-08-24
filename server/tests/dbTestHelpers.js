const { Pool } = require('pg');
const env = require('../src/config/env');

function createTestPool() {
  return new Pool({
    connectionString: env.databaseUrl,
    ssl: env.dbSsl ? { rejectUnauthorized: false } : false,
  });
}

// Runs queryFn inside a SAVEPOINT and asserts it throws (e.g. a constraint/FK
// violation). Always rolls back to the savepoint afterward so the outer test
// transaction is left usable for further assertions, and the change never
// escapes the per-test ROLLBACK in afterEach.
async function expectRejects(client, queryFn) {
  await client.query('SAVEPOINT sp');
  let succeeded = false;
  let caughtErr = null;
  try {
    await queryFn();
    succeeded = true;
  } catch (err) {
    caughtErr = err;
  }
  await client.query('ROLLBACK TO SAVEPOINT sp');
  if (succeeded) {
    throw new Error('Expected query to be rejected by the database, but it succeeded.');
  }
  return caughtErr;
}

async function insertTestUser(client, overrides = {}) {
  const email = overrides.email || `test-user-${Date.now()}-${Math.random().toString(36).slice(2)}@ccms.local`;
  const { rows } = await client.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`,
    [overrides.name || 'Test User', email, 'x'.repeat(60), overrides.role || 'STAFF']
  );
  return rows[0].id;
}

async function insertTestShop(client, shopName) {
  const name = shopName || `Test Shop ${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { rows } = await client.query(`INSERT INTO shops (shop_name) VALUES ($1) RETURNING id`, [name]);
  return rows[0].id;
}

module.exports = { createTestPool, expectRejects, insertTestUser, insertTestShop };
