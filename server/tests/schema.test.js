const { createTestPool, expectRejects, insertTestUser, insertTestShop } = require('./dbTestHelpers');

let pool;
let client;

beforeAll(async () => {
  pool = createTestPool();
  client = await pool.connect();
});

afterAll(async () => {
  client.release();
  await pool.end();
});

beforeEach(async () => {
  await client.query('BEGIN');
});

afterEach(async () => {
  await client.query('ROLLBACK');
});

describe('users table', () => {
  test('accepts ADMIN and STAFF roles', async () => {
    await insertTestUser(client, { role: 'ADMIN' });
    await insertTestUser(client, { role: 'STAFF' });
  });

  test('rejects a role outside ADMIN/STAFF', async () => {
    const err = await expectRejects(client, () => insertTestUser(client, { role: 'OWNER' }));
    expect(err.code).toBe('23514'); // check_violation
  });

  test('email uniqueness is case-insensitive (CITEXT)', async () => {
    await insertTestUser(client, { email: 'Duplicate@Example.com' });
    const err = await expectRejects(client, () => insertTestUser(client, { email: 'duplicate@example.com' }));
    expect(err.code).toBe('23505'); // unique_violation
  });
});

describe('shops table - case-insensitive identity (master context section 7)', () => {
  // Uses a randomized base name (never the literal "Freshly") so this can never
  // collide with real dev-seed shops - only the CASING varies between inserts,
  // which is exactly the behavior under test.
  function uniqueBaseName() {
    return `Freshly-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  test('Freshly / freshly / FRESHLY-style casing variants are treated as the same shop', async () => {
    const base = uniqueBaseName();
    await insertTestShop(client, base);

    const err1 = await expectRejects(client, () => insertTestShop(client, base.toLowerCase()));
    expect(err1.code).toBe('23505');

    const err2 = await expectRejects(client, () => insertTestShop(client, base.toUpperCase()));
    expect(err2.code).toBe('23505');

    const mixedCase = base
      .split('')
      .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
      .join('');
    const err3 = await expectRejects(client, () => insertTestShop(client, mixedCase));
    expect(err3.code).toBe('23505');
  });

  test('normalized_shop_name is trimmed and lowercased automatically', async () => {
    const base = uniqueBaseName();
    const { rows } = await client.query(
      `INSERT INTO shops (shop_name) VALUES ($1) RETURNING shop_name, normalized_shop_name`,
      [`  ${base}  `]
    );
    expect(rows[0].normalized_shop_name).toBe(base.toLowerCase());
  });

  test('normalization re-runs on shop_name update', async () => {
    const { rows } = await client.query(
      `INSERT INTO shops (shop_name) VALUES ($1) RETURNING id`,
      ['Original Name']
    );
    const { rows: updated } = await client.query(
      `UPDATE shops SET shop_name = $1 WHERE id = $2 RETURNING normalized_shop_name`,
      ['Updated Name', rows[0].id]
    );
    expect(updated[0].normalized_shop_name).toBe('updated name');
  });
});

describe('transactions table - constraints', () => {
  async function baseFixture() {
    const userId = await insertTestUser(client);
    const shopId = await insertTestShop(client);
    return { userId, shopId };
  }

  function validTxParams({ userId, shopId }, overrides = {}) {
    return {
      shop_id: shopId,
      transaction_date: '2026-08-10',
      bundles_10: 2,
      bundles_50: 0,
      bundles_100: 0,
      total_change_value: 2000.0,
      commission_rate: 0.03,
      profit: 60.0,
      amount_collected: 2060.0,
      created_by: userId,
      ...overrides,
    };
  }

  async function insertTx(p) {
    return client.query(
      `INSERT INTO transactions
        (shop_id, transaction_date, bundles_10, bundles_50, bundles_100,
         total_change_value, commission_rate, profit, amount_collected, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        p.shop_id,
        p.transaction_date,
        p.bundles_10,
        p.bundles_50,
        p.bundles_100,
        p.total_change_value,
        p.commission_rate,
        p.profit,
        p.amount_collected,
        p.created_by,
      ]
    );
  }

  test('a well-formed transaction is accepted', async () => {
    const fixture = await baseFixture();
    await insertTx(validTxParams(fixture));
  });

  test('rejects a transaction with zero bundles of every type', async () => {
    const fixture = await baseFixture();
    const err = await expectRejects(client, () =>
      insertTx(validTxParams(fixture, { bundles_10: 0, bundles_50: 0, bundles_100: 0, total_change_value: 0, profit: 0, amount_collected: 0 }))
    );
    expect(err.code).toBe('23514');
  });

  test('rejects a negative bundle quantity', async () => {
    const fixture = await baseFixture();
    const err = await expectRejects(client, () => insertTx(validTxParams(fixture, { bundles_10: -1 })));
    expect(err.code).toBe('23514');
  });

  test('rejects a commission rate outside {0.015, 0.03}', async () => {
    const fixture = await baseFixture();
    const err = await expectRejects(client, () =>
      insertTx(validTxParams(fixture, { commission_rate: 0.02, profit: 40, amount_collected: 2040 }))
    );
    expect(err.code).toBe('23514');
  });

  test('rejects amount_collected that does not equal change value + profit', async () => {
    const fixture = await baseFixture();
    const err = await expectRejects(client, () => insertTx(validTxParams(fixture, { amount_collected: 9999.99 })));
    expect(err.code).toBe('23514');
  });

  test('rejects a non-existent shop_id (foreign key)', async () => {
    const fixture = await baseFixture();
    const err = await expectRejects(client, () => insertTx(validTxParams(fixture, { shop_id: 999999 })));
    expect(err.code).toBe('23503'); // foreign_key_violation
  });

  test('rejects a non-existent created_by (foreign key)', async () => {
    const fixture = await baseFixture();
    const err = await expectRejects(client, () => insertTx(validTxParams(fixture, { created_by: 999999 })));
    expect(err.code).toBe('23503');
  });

  test('defaults status to ACTIVE and rejects invalid status values', async () => {
    const fixture = await baseFixture();
    const { rows } = await insertTx(validTxParams(fixture)).then(() =>
      client.query('SELECT status FROM transactions ORDER BY id DESC LIMIT 1')
    );
    expect(rows[0].status).toBe('ACTIVE');

    const err = await expectRejects(client, () =>
      client.query(
        `INSERT INTO transactions
          (shop_id, transaction_date, bundles_10, bundles_50, bundles_100,
           total_change_value, commission_rate, profit, amount_collected, created_by, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'CANCELLED')`,
        [fixture.shopId, '2026-08-10', 1, 0, 0, 1000, 0.03, 30, 1030, fixture.userId]
      )
    );
    expect(err.code).toBe('23514');
  });
});

describe('foreign key RESTRICT protects financial history', () => {
  test('cannot delete a user who has created a transaction', async () => {
    const userId = await insertTestUser(client);
    const shopId = await insertTestShop(client);
    await client.query(
      `INSERT INTO transactions
        (shop_id, transaction_date, bundles_10, bundles_50, bundles_100,
         total_change_value, commission_rate, profit, amount_collected, created_by)
       VALUES ($1,'2026-08-10',1,0,0,1000,0.03,30,1030,$2)`,
      [shopId, userId]
    );

    const err = await expectRejects(client, () => client.query('DELETE FROM users WHERE id = $1', [userId]));
    expect(err.code).toBe('23503');
  });

  test('cannot delete a shop that has a transaction', async () => {
    const userId = await insertTestUser(client);
    const shopId = await insertTestShop(client);
    await client.query(
      `INSERT INTO transactions
        (shop_id, transaction_date, bundles_10, bundles_50, bundles_100,
         total_change_value, commission_rate, profit, amount_collected, created_by)
       VALUES ($1,'2026-08-10',1,0,0,1000,0.03,30,1030,$2)`,
      [shopId, userId]
    );

    const err = await expectRejects(client, () => client.query('DELETE FROM shops WHERE id = $1', [shopId]));
    expect(err.code).toBe('23503');
  });
});

describe('inventory table', () => {
  test('rejects a negative bundle_count', async () => {
    const err = await expectRejects(client, () =>
      client.query('UPDATE inventory SET bundle_count = -1 WHERE bundle_type = 10')
    );
    expect(err.code).toBe('23514');
  });

  test('rejects a bundle_type outside the fixed denominations', async () => {
    const err = await expectRejects(client, () =>
      client.query('INSERT INTO inventory (bundle_type, bundle_count) VALUES (25, 10)')
    );
    expect(err.code).toBe('23514');
  });

  test('the three fixed denominations exist', async () => {
    const { rows } = await client.query('SELECT bundle_type FROM inventory ORDER BY bundle_type');
    expect(rows.map((r) => r.bundle_type)).toEqual([10, 50, 100]);
  });
});
