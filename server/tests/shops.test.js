const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool } = require('../src/config/db');

const PASSWORD = 'TestPassword123!';
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const STAFF_EMAIL = `shops-test-staff-${RUN_ID}@ccms.local`;
const ADMIN_EMAIL = `shops-test-admin-${RUN_ID}@ccms.local`;

let staffId;
let adminId;
const createdShopIds = [];

function uniqueShopName(label) {
  return `${label} ${RUN_ID}`;
}

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const staff = await pool.query(
    `INSERT INTO users (name,email,password_hash,role) VALUES ('Shops Test Staff',$1,$2,'STAFF') RETURNING id`,
    [STAFF_EMAIL, hash]
  );
  staffId = staff.rows[0].id;
  const admin = await pool.query(
    `INSERT INTO users (name,email,password_hash,role) VALUES ('Shops Test Admin',$1,$2,'ADMIN') RETURNING id`,
    [ADMIN_EMAIL, hash]
  );
  adminId = admin.rows[0].id;
});

afterAll(async () => {
  if (createdShopIds.length > 0) {
    await pool.query('DELETE FROM shops WHERE id = ANY($1)', [createdShopIds]);
  }
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [[staffId, adminId]]);
  await pool.end();
});

async function staffAgent() {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: STAFF_EMAIL, password: PASSWORD }).expect(200);
  return agent;
}

async function adminAgent() {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: PASSWORD }).expect(200);
  return agent;
}

describe('shops API - authentication', () => {
  test('anonymous requests are rejected', async () => {
    const res = await request(app).get('/api/shops');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/shops - create (any authenticated user, per ARCHITECTURE.md section 7)', () => {
  test('STAFF can create a shop', async () => {
    const agent = await staffAgent();
    const name = uniqueShopName('Freshly Test');
    const res = await agent.post('/api/shops').send({ shop_name: name });
    expect(res.status).toBe(201);
    expect(res.body.data.shop_name).toBe(name);
    expect(res.body.data.normalized_shop_name).toBe(name.toLowerCase());
    createdShopIds.push(res.body.data.id);
  });

  test('rejects an empty shop name', async () => {
    const agent = await staffAgent();
    const res = await agent.post('/api/shops').send({ shop_name: '   ' });
    expect(res.status).toBe(400);
  });

  test('rejects a duplicate shop name that differs only by case (Freshly / freshly / FRESHLY)', async () => {
    const agent = await staffAgent();
    const base = uniqueShopName('Case Test');

    const first = await agent.post('/api/shops').send({ shop_name: base });
    expect(first.status).toBe(201);
    createdShopIds.push(first.body.data.id);

    const dup = await agent.post('/api/shops').send({ shop_name: base.toUpperCase() });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_SHOP');
  });
});

describe('GET /api/shops/search - autocomplete', () => {
  test('prefix-matches case-insensitively and returns only matching shops', async () => {
    const agent = await staffAgent();
    const prefix = `Autocomplete${RUN_ID.replace(/[^a-zA-Z0-9]/g, '')}`;
    const names = [`${prefix} Freshly`, `${prefix} Fresh Mart`, `${prefix} Bakery Co`];

    for (const name of names) {
      // eslint-disable-next-line no-await-in-loop
      const res = await agent.post('/api/shops').send({ shop_name: name });
      createdShopIds.push(res.body.data.id);
    }

    const res = await agent.get('/api/shops/search').query({ q: `${prefix} fresh` });
    expect(res.status).toBe(200);
    const returnedNames = res.body.data.map((s) => s.shop_name);
    expect(returnedNames).toEqual(expect.arrayContaining([`${prefix} Freshly`, `${prefix} Fresh Mart`]));
    expect(returnedNames).not.toContain(`${prefix} Bakery Co`);
  });

  test('returns an empty array for a blank query rather than the whole table', async () => {
    const agent = await staffAgent();
    const res = await agent.get('/api/shops/search').query({ q: '' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('PUT /api/shops/:id - edit', () => {
  test('updates the shop name and re-normalizes it', async () => {
    const agent = await staffAgent();
    const created = await agent.post('/api/shops').send({ shop_name: uniqueShopName('Before Edit') });
    createdShopIds.push(created.body.data.id);

    const newName = uniqueShopName('After Edit');
    const res = await agent.put(`/api/shops/${created.body.data.id}`).send({ shop_name: newName });
    expect(res.status).toBe(200);
    expect(res.body.data.shop_name).toBe(newName);
    expect(res.body.data.normalized_shop_name).toBe(newName.toLowerCase());
  });

  test('editing a non-existent shop returns 404', async () => {
    const agent = await staffAgent();
    const res = await agent.put('/api/shops/9999999').send({ shop_name: 'Ghost Shop' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/shops/:id - detail', () => {
  test('returns the shop record', async () => {
    const agent = await staffAgent();
    const created = await agent.post('/api/shops').send({ shop_name: uniqueShopName('Detail Test') });
    createdShopIds.push(created.body.data.id);

    const res = await agent.get(`/api/shops/${created.body.data.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(created.body.data.id);
  });

  test('a non-existent shop returns 404', async () => {
    const agent = await staffAgent();
    const res = await agent.get('/api/shops/9999999');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/shops/:id - ADMIN only, blocked if the shop has transactions', () => {
  test('STAFF cannot delete a shop', async () => {
    const staff = await staffAgent();
    const created = await staff.post('/api/shops').send({ shop_name: uniqueShopName('Delete Perm Test') });
    createdShopIds.push(created.body.data.id);

    const res = await staff.delete(`/api/shops/${created.body.data.id}`);
    expect(res.status).toBe(403);
  });

  test('ADMIN can delete a shop with no transaction history', async () => {
    const admin = await adminAgent();
    const created = await admin.post('/api/shops').send({ shop_name: uniqueShopName('Delete OK Test') });

    const res = await admin.delete(`/api/shops/${created.body.data.id}`);
    expect(res.status).toBe(204);

    const check = await admin.get(`/api/shops/${created.body.data.id}`);
    expect(check.status).toBe(404);
    // not pushed to createdShopIds - already deleted, nothing to clean up
  });
});
