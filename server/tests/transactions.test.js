const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool } = require('../src/config/db');

const PASSWORD = 'TestPassword123!';
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const STAFF_EMAIL = `tx-test-staff-${RUN_ID}@ccms.local`;

let staffId;
let testShopId;
const createdShopIds = [];
const createdTransactionIds = [];
let originalInventory = [];

function uniqueShopName(label) {
  return `${label} ${RUN_ID}`;
}

async function createTestShop(name) {
  const { rows } = await pool.query('INSERT INTO shops (shop_name) VALUES ($1) RETURNING id', [name]);
  createdShopIds.push(rows[0].id);
  return rows[0].id;
}

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const staff = await pool.query(
    `INSERT INTO users (name,email,password_hash,role) VALUES ('Tx Test Staff',$1,$2,'STAFF') RETURNING id`,
    [STAFF_EMAIL, hash]
  );
  staffId = staff.rows[0].id;

  testShopId = await createTestShop(uniqueShopName('Tx Test Shop'));

  // Snapshot real inventory, then boost it high enough that no happy-path
  // test in this file can accidentally hit "insufficient inventory" -
  // restored to the exact original values in afterAll.
  const { rows } = await pool.query('SELECT bundle_type, bundle_count FROM inventory ORDER BY bundle_type');
  originalInventory = rows;
  await pool.query('UPDATE inventory SET bundle_count = 100000');
});

afterAll(async () => {
  if (createdTransactionIds.length > 0) {
    await pool.query('DELETE FROM transactions WHERE id = ANY($1)', [createdTransactionIds]);
  }
  if (createdShopIds.length > 0) {
    await pool.query('DELETE FROM shops WHERE id = ANY($1)', [createdShopIds]);
  }
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

function trackCreated(res) {
  if (res.body?.data?.id) createdTransactionIds.push(res.body.data.id);
  return res;
}

describe('POST /api/transactions - authentication', () => {
  test('anonymous requests are rejected', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_10: 1 });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/transactions - commission rules (master context section 3)', () => {
  test('standard rule: mixed bundles -> 1.5% (2x Rs.10 + 1x Rs.50 = Rs.7,000 -> Rs.105 profit)', async () => {
    const agent = await staffAgent();
    const res = trackCreated(
      await agent.post('/api/transactions').send({
        shop_id: testShopId,
        transaction_date: '2026-08-10',
        bundles_10: 2,
        bundles_50: 1,
        bundles_100: 0,
      })
    );

    expect(res.status).toBe(201);
    expect(Number(res.body.data.total_change_value)).toBe(7000);
    expect(Number(res.body.data.commission_rate)).toBe(0.015);
    expect(Number(res.body.data.profit)).toBe(105);
    expect(Number(res.body.data.amount_collected)).toBe(7105);
  });

  test('special rule: ONLY Rs.10 bundles -> 3% (3x Rs.10 = Rs.3,000 -> Rs.90 profit)', async () => {
    const agent = await staffAgent();
    const res = trackCreated(
      await agent.post('/api/transactions').send({
        shop_id: testShopId,
        transaction_date: '2026-08-10',
        bundles_10: 3,
        bundles_50: 0,
        bundles_100: 0,
      })
    );

    expect(res.status).toBe(201);
    expect(Number(res.body.data.total_change_value)).toBe(3000);
    expect(Number(res.body.data.commission_rate)).toBe(0.03);
    expect(Number(res.body.data.profit)).toBe(90);
    expect(Number(res.body.data.amount_collected)).toBe(3090);
  });

  test('standard rule: Rs.10,000 (1x Rs.100) -> 1.5% -> Rs.150 profit (master context worked example)', async () => {
    const agent = await staffAgent();
    const res = trackCreated(
      await agent.post('/api/transactions').send({
        shop_id: testShopId,
        transaction_date: '2026-08-10',
        bundles_10: 0,
        bundles_50: 0,
        bundles_100: 1,
      })
    );

    expect(res.status).toBe(201);
    expect(Number(res.body.data.total_change_value)).toBe(10000);
    expect(Number(res.body.data.profit)).toBe(150);
    expect(Number(res.body.data.amount_collected)).toBe(10150);
  });

  test('only Rs.50 does NOT trigger the special 3% rate (must stay 1.5%)', async () => {
    const agent = await staffAgent();
    const res = trackCreated(
      await agent.post('/api/transactions').send({
        shop_id: testShopId,
        transaction_date: '2026-08-10',
        bundles_10: 0,
        bundles_50: 2,
        bundles_100: 0,
      })
    );

    expect(res.status).toBe(201);
    expect(Number(res.body.data.commission_rate)).toBe(0.015);
  });
});

describe('POST /api/transactions - validation (master context section 22)', () => {
  test('rejects zero quantities across the board', async () => {
    const agent = await staffAgent();
    const res = await agent.post('/api/transactions').send({
      shop_id: testShopId,
      transaction_date: '2026-08-10',
      bundles_10: 0,
      bundles_50: 0,
      bundles_100: 0,
    });
    expect(res.status).toBe(400);
  });

  test('rejects negative quantities', async () => {
    const agent = await staffAgent();
    const res = await agent.post('/api/transactions').send({
      shop_id: testShopId,
      transaction_date: '2026-08-10',
      bundles_10: -1,
    });
    expect(res.status).toBe(400);
  });

  test('rejects non-integer quantities', async () => {
    const agent = await staffAgent();
    const res = await agent.post('/api/transactions').send({
      shop_id: testShopId,
      transaction_date: '2026-08-10',
      bundles_10: 1.5,
    });
    expect(res.status).toBe(400);
  });

  test('rejects a missing shop', async () => {
    const agent = await staffAgent();
    const res = await agent.post('/api/transactions').send({
      transaction_date: '2026-08-10',
      bundles_10: 1,
    });
    expect(res.status).toBe(400);
  });

  test('rejects a shop_id that does not exist', async () => {
    const agent = await staffAgent();
    const res = await agent.post('/api/transactions').send({
      shop_id: 9999999,
      transaction_date: '2026-08-10',
      bundles_10: 1,
    });
    expect(res.status).toBe(404);
  });

  test('rejects a shop_id beyond Postgres INTEGER range with a clean 400, not a raw DB error', async () => {
    const agent = await staffAgent();
    const res = await agent.post('/api/transactions').send({
      shop_id: 99999999999999999999,
      transaction_date: '2026-08-10',
      bundles_10: 1,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects a missing/invalid transaction date', async () => {
    const agent = await staffAgent();
    const res = await agent.post('/api/transactions').send({
      shop_id: testShopId,
      transaction_date: 'not-a-date',
      bundles_10: 1,
    });
    expect(res.status).toBe(400);
  });

  test('accepts a historical (past) transaction date', async () => {
    const agent = await staffAgent();
    const res = trackCreated(
      await agent.post('/api/transactions').send({
        shop_id: testShopId,
        transaction_date: '2020-01-01',
        bundles_10: 1,
      })
    );
    expect(res.status).toBe(201);
  });

  test('rejects a future transaction date', async () => {
    const agent = await staffAgent();
    const farFuture = '2099-01-01';
    const res = await agent.post('/api/transactions').send({
      shop_id: testShopId,
      transaction_date: farFuture,
      bundles_10: 1,
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/transactions - case-insensitive shop identity', () => {
  test('a shop found via a differently-cased search resolves to the SAME shop on the created transaction', async () => {
    const agent = await staffAgent();
    const shopName = uniqueShopName('CaseTx Freshly');
    const created = await agent.post('/api/shops').send({ shop_name: shopName });
    createdShopIds.push(created.body.data.id);

    const searchRes = await agent.get('/api/shops/search').query({ q: shopName.toUpperCase().slice(0, 8) });
    const found = searchRes.body.data.find((s) => s.id === created.body.data.id);
    expect(found).toBeTruthy();

    const txRes = trackCreated(
      await agent.post('/api/transactions').send({
        shop_id: found.id,
        transaction_date: '2026-08-10',
        bundles_10: 1,
      })
    );
    expect(txRes.status).toBe(201);
    expect(txRes.body.data.shop_id).toBe(created.body.data.id);
    expect(txRes.body.data.shop_name).toBe(shopName);
  });
});

describe('POST /api/transactions - inventory integration (master context sections 11-13)', () => {
  test('inventory decreases by exactly the requested quantities', async () => {
    const agent = await staffAgent();
    const before = await pool.query('SELECT bundle_count FROM inventory WHERE bundle_type = 10');

    trackCreated(
      await agent.post('/api/transactions').send({
        shop_id: testShopId,
        transaction_date: '2026-08-10',
        bundles_10: 7,
      }).expect(201)
    );

    const after = await pool.query('SELECT bundle_count FROM inventory WHERE bundle_type = 10');
    expect(after.rows[0].bundle_count).toBe(before.rows[0].bundle_count - 7);
  });

  test('rejects the transaction outright when inventory is insufficient, and creates nothing', async () => {
    const agent = await staffAgent();

    await pool.query("UPDATE inventory SET bundle_count = 2 WHERE bundle_type = 50");
    const txCountBefore = await pool.query('SELECT count(*) FROM transactions');

    const res = await agent.post('/api/transactions').send({
      shop_id: testShopId,
      transaction_date: '2026-08-10',
      bundles_50: 4,
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_INVENTORY');

    const txCountAfter = await pool.query('SELECT count(*) FROM transactions');
    expect(txCountAfter.rows[0].count).toBe(txCountBefore.rows[0].count);

    const inv = await pool.query('SELECT bundle_count FROM inventory WHERE bundle_type = 50');
    expect(inv.rows[0].bundle_count).toBe(2); // unchanged by the rejected attempt

    await pool.query('UPDATE inventory SET bundle_count = 100000 WHERE bundle_type = 50');
  });

  test('a transaction spanning multiple bundle types only rejects if ANY one type is insufficient, and touches neither on rejection', async () => {
    const agent = await staffAgent();
    await pool.query("UPDATE inventory SET bundle_count = 1 WHERE bundle_type = 100");
    const before10 = await pool.query('SELECT bundle_count FROM inventory WHERE bundle_type = 10');

    const res = await agent.post('/api/transactions').send({
      shop_id: testShopId,
      transaction_date: '2026-08-10',
      bundles_10: 5,
      bundles_100: 3, // only 1 available
    });

    expect(res.status).toBe(409);

    const after10 = await pool.query('SELECT bundle_count FROM inventory WHERE bundle_type = 10');
    expect(after10.rows[0].bundle_count).toBe(before10.rows[0].bundle_count); // untouched, even though it alone was sufficient

    await pool.query('UPDATE inventory SET bundle_count = 100000 WHERE bundle_type = 100');
  });
});

describe('GET /api/transactions and /api/transactions/:id', () => {
  test('a created transaction appears in the list and can be fetched by id', async () => {
    const agent = await staffAgent();
    const created = trackCreated(
      await agent.post('/api/transactions').send({
        shop_id: testShopId,
        transaction_date: '2026-08-10',
        bundles_10: 1,
      }).expect(201)
    );

    const detail = await agent.get(`/api/transactions/${created.body.data.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(created.body.data.id);

    const list = await agent.get('/api/transactions');
    expect(list.status).toBe(200);
    expect(list.body.data.some((t) => t.id === created.body.data.id)).toBe(true);
  });

  test('a non-existent transaction returns 404', async () => {
    const agent = await staffAgent();
    const res = await agent.get('/api/transactions/9999999');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/transactions - inventory boundary conditions (phase 4)', () => {
  test('requesting exactly the available amount succeeds and leaves the count at zero', async () => {
    await pool.query('UPDATE inventory SET bundle_count = 3 WHERE bundle_type = 100');
    const agent = await staffAgent();

    const res = trackCreated(
      await agent
        .post('/api/transactions')
        .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_100: 3 })
    );
    expect(res.status).toBe(201);

    const inv = await pool.query('SELECT bundle_count FROM inventory WHERE bundle_type = 100');
    expect(inv.rows[0].bundle_count).toBe(0);

    await pool.query('UPDATE inventory SET bundle_count = 100000 WHERE bundle_type = 100');
  });

  test('when available inventory is exactly zero, any request for that type is rejected', async () => {
    await pool.query('UPDATE inventory SET bundle_count = 0 WHERE bundle_type = 100');
    const agent = await staffAgent();

    const res = await agent
      .post('/api/transactions')
      .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_100: 1 });
    expect(res.status).toBe(409);

    await pool.query('UPDATE inventory SET bundle_count = 100000 WHERE bundle_type = 100');
  });
});

describe('POST /api/transactions - concurrent/atomic behavior', () => {
  test('two simultaneous requests for more than the shared available stock: exactly one succeeds', async () => {
    await pool.query('UPDATE inventory SET bundle_count = 5 WHERE bundle_type = 50');
    const agent1 = await staffAgent();
    const agent2 = await staffAgent();

    const [res1, res2] = await Promise.all([
      agent1.post('/api/transactions').send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_50: 3 }),
      agent2.post('/api/transactions').send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_50: 3 }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const succeeded = res1.status === 201 ? res1 : res2;
    trackCreated(succeeded);

    const inv = await pool.query('SELECT bundle_count FROM inventory WHERE bundle_type = 50');
    expect(inv.rows[0].bundle_count).toBe(2); // 5 - 3, never double-deducted and never negative

    await pool.query('UPDATE inventory SET bundle_count = 100000 WHERE bundle_type = 50');
  });
});

describe('PUT /api/transactions/:id - editing (master context section 14)', () => {
  test('requires authentication', async () => {
    const res = await request(app)
      .put('/api/transactions/1')
      .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_10: 1 });
    expect(res.status).toBe(401);
  });

  test("the master context's own worked example: 2x10+1x50 edited to 1x10+3x50, inventory net-adjusted correctly", async () => {
    const agent = await staffAgent();
    const created = trackCreated(
      await agent
        .post('/api/transactions')
        .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_10: 2, bundles_50: 1 })
        .expect(201)
    );
    expect(Number(created.body.data.amount_collected)).toBe(7105); // 7,000 + 1.5%

    const inv10Before = await pool.query('SELECT bundle_count FROM inventory WHERE bundle_type = 10');
    const inv50Before = await pool.query('SELECT bundle_count FROM inventory WHERE bundle_type = 50');

    const editRes = await agent.put(`/api/transactions/${created.body.data.id}`).send({
      shop_id: testShopId,
      transaction_date: '2026-08-10',
      bundles_10: 1,
      bundles_50: 3,
      bundles_100: 0,
    });

    expect(editRes.status).toBe(200);
    expect(Number(editRes.body.data.total_change_value)).toBe(16000); // 1,000 + 15,000
    expect(Number(editRes.body.data.commission_rate)).toBe(0.015);
    expect(Number(editRes.body.data.profit)).toBe(240);
    expect(Number(editRes.body.data.amount_collected)).toBe(16240);

    // 10: restore 2, deduct 1 -> net +1. 50: restore 1, deduct 3 -> net -2.
    const inv10After = await pool.query('SELECT bundle_count FROM inventory WHERE bundle_type = 10');
    const inv50After = await pool.query('SELECT bundle_count FROM inventory WHERE bundle_type = 50');
    expect(inv10After.rows[0].bundle_count).toBe(inv10Before.rows[0].bundle_count + 1);
    expect(inv50After.rows[0].bundle_count).toBe(inv50Before.rows[0].bundle_count - 2);
  });

  test('an edit reducing bundle usage gives inventory back accordingly', async () => {
    const agent = await staffAgent();
    const created = trackCreated(
      await agent
        .post('/api/transactions')
        .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_10: 10 })
        .expect(201)
    );
    const before = await pool.query('SELECT bundle_count FROM inventory WHERE bundle_type = 10');

    const editRes = await agent
      .put(`/api/transactions/${created.body.data.id}`)
      .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_10: 4 });
    expect(editRes.status).toBe(200);

    const after = await pool.query('SELECT bundle_count FROM inventory WHERE bundle_type = 10');
    expect(after.rows[0].bundle_count).toBe(before.rows[0].bundle_count + 6);
  });

  test('an edit requiring more inventory than is available is rejected, leaving the original transaction and inventory untouched', async () => {
    await pool.query('UPDATE inventory SET bundle_count = 5 WHERE bundle_type = 100');
    const agent = await staffAgent();
    const created = trackCreated(
      await agent
        .post('/api/transactions')
        .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_100: 2 })
        .expect(201)
    ); // 3 remain free (5 - 2)

    const editRes = await agent
      .put(`/api/transactions/${created.body.data.id}`)
      .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_100: 10 }); // needs 10, max ever obtainable is 5
    expect(editRes.status).toBe(409);

    const txCheck = await pool.query('SELECT bundles_100 FROM transactions WHERE id = $1', [created.body.data.id]);
    expect(txCheck.rows[0].bundles_100).toBe(2); // original untouched

    const inv = await pool.query('SELECT bundle_count FROM inventory WHERE bundle_type = 100');
    expect(inv.rows[0].bundle_count).toBe(3); // untouched by the rejected edit

    await pool.query('UPDATE inventory SET bundle_count = 100000 WHERE bundle_type = 100');
  });

  test('editing can change the associated shop', async () => {
    const agent = await staffAgent();
    const otherShopId = await createTestShop(uniqueShopName('Edit Retarget Shop'));

    const created = trackCreated(
      await agent
        .post('/api/transactions')
        .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_10: 1 })
        .expect(201)
    );

    const editRes = await agent
      .put(`/api/transactions/${created.body.data.id}`)
      .send({ shop_id: otherShopId, transaction_date: '2026-08-10', bundles_10: 1 });
    expect(editRes.status).toBe(200);
    expect(editRes.body.data.shop_id).toBe(otherShopId);
  });

  test('rejects the same validation failures as create (zero quantities)', async () => {
    const agent = await staffAgent();
    const created = trackCreated(
      await agent
        .post('/api/transactions')
        .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_10: 1 })
        .expect(201)
    );

    const res = await agent
      .put(`/api/transactions/${created.body.data.id}`)
      .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_10: 0, bundles_50: 0, bundles_100: 0 });
    expect(res.status).toBe(400);
  });

  test('editing a non-existent transaction returns 404', async () => {
    const agent = await staffAgent();
    const res = await agent
      .put('/api/transactions/9999999')
      .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_10: 1 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/transactions/:id - deletion restores inventory (master context section 15)', () => {
  test('requires authentication', async () => {
    const res = await request(app).delete('/api/transactions/1');
    expect(res.status).toBe(401);
  });

  test('deleting restores the exact bundle quantities to inventory and voids the transaction', async () => {
    const agent = await staffAgent();
    const before = await pool.query('SELECT bundle_count FROM inventory WHERE bundle_type = 10');

    const created = trackCreated(
      await agent
        .post('/api/transactions')
        .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_10: 5 })
        .expect(201)
    );

    const afterCreate = await pool.query('SELECT bundle_count FROM inventory WHERE bundle_type = 10');
    expect(afterCreate.rows[0].bundle_count).toBe(before.rows[0].bundle_count - 5);

    const delRes = await agent.delete(`/api/transactions/${created.body.data.id}`);
    expect(delRes.status).toBe(204);

    const afterDelete = await pool.query('SELECT bundle_count FROM inventory WHERE bundle_type = 10');
    expect(afterDelete.rows[0].bundle_count).toBe(before.rows[0].bundle_count); // fully restored

    const txCheck = await pool.query('SELECT status FROM transactions WHERE id = $1', [created.body.data.id]);
    expect(txCheck.rows[0].status).toBe('VOID');
  });

  test('a voided transaction disappears from the active list but its detail remains viewable', async () => {
    const agent = await staffAgent();
    const created = trackCreated(
      await agent
        .post('/api/transactions')
        .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_10: 1 })
        .expect(201)
    );
    await agent.delete(`/api/transactions/${created.body.data.id}`).expect(204);

    const list = await agent.get('/api/transactions');
    expect(list.body.data.some((t) => t.id === created.body.data.id)).toBe(false);

    const detail = await agent.get(`/api/transactions/${created.body.data.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe('VOID');
  });

  test('deleting an already-voided transaction is rejected', async () => {
    const agent = await staffAgent();
    const created = trackCreated(
      await agent
        .post('/api/transactions')
        .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_10: 1 })
        .expect(201)
    );
    await agent.delete(`/api/transactions/${created.body.data.id}`).expect(204);

    const res = await agent.delete(`/api/transactions/${created.body.data.id}`);
    expect(res.status).toBe(409);
  });

  test('editing an already-voided transaction is rejected', async () => {
    const agent = await staffAgent();
    const created = trackCreated(
      await agent
        .post('/api/transactions')
        .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_10: 1 })
        .expect(201)
    );
    await agent.delete(`/api/transactions/${created.body.data.id}`).expect(204);

    const res = await agent
      .put(`/api/transactions/${created.body.data.id}`)
      .send({ shop_id: testShopId, transaction_date: '2026-08-10', bundles_10: 2 });
    expect(res.status).toBe(409);
  });

  test('deleting a non-existent transaction returns 404', async () => {
    const agent = await staffAgent();
    const res = await agent.delete('/api/transactions/9999999');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/transactions - search, filtering, sorting, pagination (phase 5)', () => {
  // Uses its own dedicated shop and a small, precisely-known set of
  // transactions so count/order assertions can't be thrown off by whatever
  // other tests in this file have already created against the shared
  // testShopId by the time this block runs.
  let filterShopId;
  let otherShopId;
  const filterTxIds = [];

  beforeAll(async () => {
    filterShopId = await createTestShop(uniqueShopName('Filter Target Shop'));
    otherShopId = await createTestShop(uniqueShopName('Filter Other Shop'));

    const agent = await staffAgent();
    const specs = [
      { shop_id: filterShopId, transaction_date: '2020-01-01', bundles_10: 1 }, // Rs.1,030
      { shop_id: filterShopId, transaction_date: '2020-01-02', bundles_50: 1 }, // Rs.5,075
      { shop_id: filterShopId, transaction_date: '2020-01-03', bundles_100: 1 }, // Rs.10,150
      { shop_id: otherShopId, transaction_date: '2020-01-02', bundles_10: 1 }, // different shop, same date as #2
    ];
    for (const spec of specs) {
      // eslint-disable-next-line no-await-in-loop
      const res = await agent.post('/api/transactions').send(spec).expect(201);
      filterTxIds.push(res.body.data.id);
      createdTransactionIds.push(res.body.data.id);
    }
  });

  test('list responses include created_by_name', async () => {
    const agent = await staffAgent();
    const res = await agent.get('/api/transactions').query({ shop_id: filterShopId });
    expect(res.status).toBe(200);
    expect(res.body.data[0].created_by_name).toBe('Tx Test Staff');
  });

  test('transaction detail includes created_by_name', async () => {
    const agent = await staffAgent();
    const res = await agent.get(`/api/transactions/${filterTxIds[0]}`);
    expect(res.body.data.created_by_name).toBe('Tx Test Staff');
  });

  test('shop_id filters to only that shop', async () => {
    const agent = await staffAgent();
    const res = await agent.get('/api/transactions').query({ shop_id: filterShopId, pageSize: 50 });
    expect(res.status).toBe(200);
    expect(res.body.data.every((t) => t.shop_id === filterShopId)).toBe(true);
    expect(res.body.data.length).toBe(3);
  });

  test('search matches shop name case-insensitively', async () => {
    const agent = await staffAgent();
    const res = await agent
      .get('/api/transactions')
      .query({ search: uniqueShopName('filter target shop').toLowerCase(), pageSize: 50 });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
    expect(res.body.data.every((t) => t.shop_id === filterShopId)).toBe(true);
  });

  test('date_from/date_to narrows to the requested range', async () => {
    const agent = await staffAgent();
    const res = await agent
      .get('/api/transactions')
      .query({ shop_id: filterShopId, date_from: '2020-01-02', date_to: '2020-01-02' });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].transaction_date).toBe('2020-01-02');
  });

  test('date_desc (default) and date_asc sort correctly', async () => {
    const agent = await staffAgent();
    const desc = await agent.get('/api/transactions').query({ shop_id: filterShopId, sort: 'date_desc' });
    expect(desc.body.data.map((t) => t.transaction_date)).toEqual(['2020-01-03', '2020-01-02', '2020-01-01']);

    const asc = await agent.get('/api/transactions').query({ shop_id: filterShopId, sort: 'date_asc' });
    expect(asc.body.data.map((t) => t.transaction_date)).toEqual(['2020-01-01', '2020-01-02', '2020-01-03']);
  });

  test('amount_desc and amount_asc sort correctly', async () => {
    const agent = await staffAgent();
    const desc = await agent.get('/api/transactions').query({ shop_id: filterShopId, sort: 'amount_desc' });
    expect(desc.body.data.map((t) => Number(t.amount_collected))).toEqual([10150, 5075, 1030]);

    const asc = await agent.get('/api/transactions').query({ shop_id: filterShopId, sort: 'amount_asc' });
    expect(asc.body.data.map((t) => Number(t.amount_collected))).toEqual([1030, 5075, 10150]);
  });

  test('pagination: pageSize and page correctly slice results, with accurate totals', async () => {
    const agent = await staffAgent();
    const page1 = await agent
      .get('/api/transactions')
      .query({ shop_id: filterShopId, sort: 'date_asc', page: 1, pageSize: 2 });
    expect(page1.body.data.length).toBe(2);
    expect(page1.body.pagination).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(page1.body.data.map((t) => t.transaction_date)).toEqual(['2020-01-01', '2020-01-02']);

    const page2 = await agent
      .get('/api/transactions')
      .query({ shop_id: filterShopId, sort: 'date_asc', page: 2, pageSize: 2 });
    expect(page2.body.data.length).toBe(1);
    expect(page2.body.pagination).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(page2.body.data[0].transaction_date).toBe('2020-01-03');
  });

  test('a filter matching nothing returns an empty array and zero totals, not an error', async () => {
    const agent = await staffAgent();
    const res = await agent
      .get('/api/transactions')
      .query({ shop_id: filterShopId, date_from: '2099-01-01' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });

  test('rejects an invalid sort value', async () => {
    const agent = await staffAgent();
    const res = await agent.get('/api/transactions').query({ sort: 'not-a-real-sort' });
    expect(res.status).toBe(400);
  });

  test('rejects an invalid date_from', async () => {
    const agent = await staffAgent();
    const res = await agent.get('/api/transactions').query({ date_from: 'not-a-date' });
    expect(res.status).toBe(400);
  });
});
