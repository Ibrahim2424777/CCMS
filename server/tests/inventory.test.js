const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool } = require('../src/config/db');

const PASSWORD = 'TestPassword123!';
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const STAFF_EMAIL = `inv-test-staff-${RUN_ID}@ccms.local`;

let staffId;
let originalInventory = [];

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const staff = await pool.query(
    `INSERT INTO users (name,email,password_hash,role) VALUES ('Inventory Test Staff',$1,$2,'STAFF') RETURNING id`,
    [STAFF_EMAIL, hash]
  );
  staffId = staff.rows[0].id;

  const { rows } = await pool.query('SELECT bundle_type, bundle_count FROM inventory ORDER BY bundle_type');
  originalInventory = rows;
});

afterAll(async () => {
  for (const row of originalInventory) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query('UPDATE inventory SET bundle_count = $1 WHERE bundle_type = $2', [
      row.bundle_count,
      row.bundle_type,
    ]);
  }
  await pool.query('DELETE FROM users WHERE id = $1', [staffId]);
  await pool.end();
});

async function staffAgent() {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: STAFF_EMAIL, password: PASSWORD }).expect(200);
  return agent;
}

describe('GET /api/inventory', () => {
  test('requires authentication', async () => {
    const res = await request(app).get('/api/inventory');
    expect(res.status).toBe(401);
  });

  test('returns bundle counts, note counts, monetary values, and totals (master context section 11)', async () => {
    await pool.query('UPDATE inventory SET bundle_count = 7 WHERE bundle_type = 10');
    await pool.query('UPDATE inventory SET bundle_count = 3 WHERE bundle_type = 50');
    await pool.query('UPDATE inventory SET bundle_count = 2 WHERE bundle_type = 100');

    const agent = await staffAgent();
    const res = await agent.get('/api/inventory');
    expect(res.status).toBe(200);

    const byType = Object.fromEntries(res.body.data.bundles.map((b) => [b.bundle_type, b]));
    expect(byType[10]).toMatchObject({ bundle_count: 7, note_count: 700, value: 7000 });
    expect(byType[50]).toMatchObject({ bundle_count: 3, note_count: 300, value: 15000 });
    expect(byType[100]).toMatchObject({ bundle_count: 2, note_count: 200, value: 20000 });

    expect(res.body.data.totals).toEqual({ bundle_count: 12, note_count: 1200, value: 42000 });
  });

  test('reflects zero inventory correctly (no divide-by-zero or NaN)', async () => {
    await pool.query('UPDATE inventory SET bundle_count = 0');
    const agent = await staffAgent();
    const res = await agent.get('/api/inventory');
    expect(res.body.data.totals).toEqual({ bundle_count: 0, note_count: 0, value: 0 });
    for (const b of res.body.data.bundles) {
      expect(b.bundle_count).toBe(0);
      expect(b.note_count).toBe(0);
      expect(b.value).toBe(0);
    }
  });
});
