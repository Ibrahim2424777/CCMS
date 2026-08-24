const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool } = require('../src/config/db');
const {
  todayInPakistan,
  daysAgoInPakistan,
  startOfWeekInPakistan,
  startOfMonthInPakistan,
  previousMonthBoundsInPakistan,
} = require('../src/utils/dateUtils');

const PASSWORD = 'TestPassword123!';
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const STAFF_EMAIL = `analytics-test-staff-${RUN_ID}@ccms.local`;

let staffId;
let shopAId;
let shopBId;
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
    `INSERT INTO users (name,email,password_hash,role) VALUES ('Analytics Test Staff',$1,$2,'STAFF') RETURNING id`,
    [STAFF_EMAIL, hash]
  );
  staffId = staff.rows[0].id;
  shopAId = await createTestShop(uniqueShopName('Analytics Shop A'));
  shopBId = await createTestShop(uniqueShopName('Analytics Shop B'));

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

async function createTx(agent, shopId, date, bundles) {
  const res = await agent.post('/api/transactions').send({ shop_id: shopId, transaction_date: date, ...bundles });
  expect(res.status).toBe(201);
  createdTransactionIds.push(res.body.data.id);
  return res.body.data;
}

async function getSummary(agent, params) {
  const res = await agent.get('/api/analytics/summary').query(params);
  expect(res.status).toBe(200);
  return res.body.data;
}

describe('GET /api/analytics/summary - authentication and validation', () => {
  test('requires authentication', async () => {
    const res = await request(app).get('/api/analytics/summary').query({ range: 'today' });
    expect(res.status).toBe(401);
  });

  test('rejects an invalid range', async () => {
    const agent = await staffAgent();
    const res = await agent.get('/api/analytics/summary').query({ range: 'nextCentury' });
    expect(res.status).toBe(400);
  });

  test('custom range requires from and to', async () => {
    const agent = await staffAgent();
    const res = await agent.get('/api/analytics/summary').query({ range: 'custom' });
    expect(res.status).toBe(400);
  });

  test('custom range rejects from after to', async () => {
    const agent = await staffAgent();
    const res = await agent
      .get('/api/analytics/summary')
      .query({ range: 'custom', from: '2026-01-10', to: '2026-01-01' });
    expect(res.status).toBe(400);
  });

  test('rejects an out-of-bounds limit', async () => {
    const agent = await staffAgent();
    const res = await agent.get('/api/analytics/summary').query({ range: 'today', limit: 999 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/analytics/summary - preset range resolution (day-independent)', () => {
  test.each([
    ['today', () => ({ from: todayInPakistan(), to: todayInPakistan() })],
    ['yesterday', () => ({ from: daysAgoInPakistan(1), to: daysAgoInPakistan(1) })],
    ['last7days', () => ({ from: daysAgoInPakistan(6), to: todayInPakistan() })],
    ['last30days', () => ({ from: daysAgoInPakistan(29), to: todayInPakistan() })],
    ['thisWeek', () => ({ from: startOfWeekInPakistan(), to: todayInPakistan() })],
    ['thisMonth', () => ({ from: startOfMonthInPakistan(), to: todayInPakistan() })],
    ['previousMonth', () => previousMonthBoundsInPakistan()],
  ])('range=%s resolves to the expected {from,to}', async (range, expectedFn) => {
    const agent = await staffAgent();
    const data = await getSummary(agent, { range });
    expect(data.range).toEqual(expectedFn());
  });

  test('a custom range echoes back exactly the requested from/to', async () => {
    const agent = await staffAgent();
    const data = await getSummary(agent, { range: 'custom', from: '2019-03-01', to: '2019-03-31' });
    expect(data.range).toEqual({ from: '2019-03-01', to: '2019-03-31' });
  });
});

describe('GET /api/analytics/summary - single day (isolated historical date)', () => {
  const day = '2019-03-01';

  test('totals, bundle distribution, and top shops match a hand-calculated known dataset', async () => {
    const agent = await staffAgent();
    await createTx(agent, shopAId, day, { bundles_10: 2 }); // 2000 @ 3% = 60
    await createTx(agent, shopBId, day, { bundles_50: 1, bundles_100: 1 }); // 15000 @ 1.5% = 225

    const data = await getSummary(agent, { range: 'custom', from: day, to: day });

    expect(data.totals).toEqual({
      transactions: 2,
      uniqueShops: 2,
      totalChange: 17000,
      totalProfit: 285,
      avgTransaction: 8500,
      avgProfit: 142.5,
    });

    const byType = Object.fromEntries(data.bundleDistribution.map((b) => [b.bundleType, b]));
    expect(byType[10]).toEqual({ bundleType: 10, count: 2, value: 2000 });
    expect(byType[50]).toEqual({ bundleType: 50, count: 1, value: 5000 });
    expect(byType[100]).toEqual({ bundleType: 100, count: 1, value: 10000 });

    expect(data.topShops).toHaveLength(2);
    expect(data.topShops.map((s) => s.transactions)).toEqual([1, 1]);

    expect(data.trend.groupBy).toBe('day');
    expect(data.trend.points).toEqual([{ period: day, profit: 285, change: 17000 }]);
  });
});

describe('GET /api/analytics/summary - a full week (isolated historical range)', () => {
  const weekFrom = '2019-04-01'; // Monday
  const weekTo = '2019-04-07'; // Sunday

  test('aggregates correctly across multiple days and correctly excludes a day just outside the range', async () => {
    const agent = await staffAgent();
    await createTx(agent, shopAId, '2019-04-01', { bundles_10: 1 }); // 1000 @ 3% = 30
    await createTx(agent, shopAId, '2019-04-04', { bundles_50: 2 }); // 10000 @ 1.5% = 150
    await createTx(agent, shopBId, '2019-04-07', { bundles_100: 1 }); // 10000 @ 1.5% = 150
    // just outside the range on both sides - must not be counted
    await createTx(agent, shopAId, '2019-03-31', { bundles_10: 9 });
    await createTx(agent, shopAId, '2019-04-08', { bundles_10: 9 });

    const data = await getSummary(agent, { range: 'custom', from: weekFrom, to: weekTo });

    expect(data.totals.transactions).toBe(3);
    expect(data.totals.totalChange).toBe(21000);
    expect(data.totals.totalProfit).toBe(330);
    expect(data.trend.groupBy).toBe('day');
    expect(data.trend.points).toHaveLength(7);
    expect(data.trend.points.reduce((sum, p) => sum + p.profit, 0)).toBe(330);
  });
});

describe('GET /api/analytics/summary - a full month with a boundary-excluded neighbor', () => {
  const monthFrom = '2019-05-01';
  const monthTo = '2019-05-31';

  test('includes everything inside the month and nothing from the adjacent months', async () => {
    const agent = await staffAgent();
    await createTx(agent, shopAId, '2019-05-01', { bundles_10: 1 }); // boundary: first day, included
    await createTx(agent, shopAId, '2019-05-31', { bundles_10: 1 }); // boundary: last day, included
    await createTx(agent, shopAId, '2019-04-30', { bundles_10: 9 }); // just before, excluded
    await createTx(agent, shopAId, '2019-06-01', { bundles_10: 9 }); // just after, excluded

    const data = await getSummary(agent, { range: 'custom', from: monthFrom, to: monthTo });

    expect(data.totals.transactions).toBe(2);
    expect(data.totals.totalChange).toBe(2000);
  });
});

describe('GET /api/analytics/summary - empty range', () => {
  test('returns clean zeros, not null/NaN or an error, when nothing matches', async () => {
    const agent = await staffAgent();
    const data = await getSummary(agent, { range: 'custom', from: '2019-09-01', to: '2019-09-07' });

    expect(data.totals).toEqual({
      transactions: 0,
      uniqueShops: 0,
      totalChange: 0,
      totalProfit: 0,
      avgTransaction: 0,
      avgProfit: 0,
    });
    expect(data.bundleDistribution.every((b) => b.count === 0 && b.value === 0)).toBe(true);
    expect(data.topShops).toEqual([]);
    expect(data.trend.points).toHaveLength(7);
    expect(data.trend.points.every((p) => p.profit === 0 && p.change === 0)).toBe(true);
  });
});

describe('GET /api/analytics/summary - timezone behavior', () => {
  test("a transaction dated 'today' is correctly attributed to today's date, not shifted a day", async () => {
    const agent = await staffAgent();
    const today = todayInPakistan();
    const created = await createTx(agent, shopAId, today, { bundles_10: 1 });
    expect(created.transaction_date).toBe(today);

    const data = await getSummary(agent, { range: 'today' });
    expect(data.trend.points[data.trend.points.length - 1].period).toBe(today);
    expect(data.totals.transactions).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/analytics/summary - reflects edits and deletions', () => {
  const day = '2019-03-15'; // isolated, untouched by any other test in this file

  test('an edit changes the range totals to the new values, not the old ones added on top', async () => {
    const agent = await staffAgent();
    const created = await createTx(agent, shopAId, day, { bundles_10: 3 }); // 3000 @ 3% = 90

    const beforeEdit = await getSummary(agent, { range: 'custom', from: day, to: day });
    expect(beforeEdit.totals).toMatchObject({ transactions: 1, totalChange: 3000, totalProfit: 90 });

    await agent
      .put(`/api/transactions/${created.id}`)
      .send({ shop_id: shopAId, transaction_date: day, bundles_50: 1 }) // 5000 @ 1.5% = 75
      .expect(200);

    const afterEdit = await getSummary(agent, { range: 'custom', from: day, to: day });
    expect(afterEdit.totals).toMatchObject({ transactions: 1, totalChange: 5000, totalProfit: 75 });

    await agent.delete(`/api/transactions/${created.id}`).expect(204);

    const afterDelete = await getSummary(agent, { range: 'custom', from: day, to: day });
    expect(afterDelete.totals).toMatchObject({ transactions: 0, totalChange: 0, totalProfit: 0 });
  });
});
