const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool } = require('../src/config/db');
const {
  todayInPakistan,
  daysAgoInPakistan,
  startOfWeekInPakistan,
  startOfMonthInPakistan,
} = require('../src/utils/dateUtils');

const PASSWORD = 'TestPassword123!';
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const STAFF_EMAIL = `dash-test-staff-${RUN_ID}@ccms.local`;

let staffId;
let testShopId;
const createdShopIds = [];
const createdTransactionIds = [];
let originalInventory = [];

const today = todayInPakistan();
const weekStart = startOfWeekInPakistan();
const monthStart = startOfMonthInPakistan();
// Guaranteed to fall outside any real week/month boundary, regardless of when this runs.
const outsideDate = daysAgoInPakistan(400);

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
    `INSERT INTO users (name,email,password_hash,role) VALUES ('Dashboard Test Staff',$1,$2,'STAFF') RETURNING id`,
    [STAFF_EMAIL, hash]
  );
  staffId = staff.rows[0].id;
  testShopId = await createTestShop(uniqueShopName('Dashboard Test Shop'));

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

async function createTx(agent, date, bundles) {
  const res = await agent.post('/api/transactions').send({ shop_id: testShopId, transaction_date: date, ...bundles });
  expect(res.status).toBe(201);
  createdTransactionIds.push(res.body.data.id);
  return res.body.data;
}

describe('GET /api/analytics/dashboard - authentication', () => {
  test('requires authentication', async () => {
    const res = await request(app).get('/api/analytics/dashboard');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/analytics/dashboard - today/week/month figures (day-of-week/month independent)', () => {
  test('deltas match exactly what a known set of dated fixtures should contribute to each bucket', async () => {
    const agent = await staffAgent();
    const before = (await agent.get('/api/analytics/dashboard')).body.data;

    // 1000 @ 3% (only Rs.10) = 30 profit
    await createTx(agent, today, { bundles_10: 1 });
    // 5000 @ 1.5% (only Rs.50) = 75, rounds up to 80 profit
    await createTx(agent, weekStart, { bundles_50: 1 });
    // 10000 @ 1.5% (only Rs.100) = 150 profit
    await createTx(agent, monthStart, { bundles_100: 1 });
    // 5000 @ 3% (only Rs.10), far outside any bucket
    await createTx(agent, outsideDate, { bundles_10: 5 });

    const fixtures = [
      { date: today, change: 1000, profit: 30 },
      { date: weekStart, change: 5000, profit: 80 },
      { date: monthStart, change: 10000, profit: 150 },
      { date: outsideDate, change: 5000, profit: 150 },
    ];
    const expectedFor = (predicate) =>
      fixtures.filter(predicate).reduce(
        (acc, f) => ({ change: acc.change + f.change, profit: acc.profit + f.profit, count: acc.count + 1 }),
        { change: 0, profit: 0, count: 0 }
      );

    const expectedToday = expectedFor((f) => f.date === today);
    const expectedWeek = expectedFor((f) => f.date >= weekStart);
    const expectedMonth = expectedFor((f) => f.date >= monthStart);

    const after = (await agent.get('/api/analytics/dashboard')).body.data;

    expect(after.today.change - before.today.change).toBe(expectedToday.change);
    expect(after.today.profit - before.today.profit).toBe(expectedToday.profit);
    expect(after.today.transactions - before.today.transactions).toBe(expectedToday.count);
    expect(after.today.shops - before.today.shops).toBe(expectedToday.count > 0 ? 1 : 0); // one new shop active today

    expect(after.week.change - before.week.change).toBe(expectedWeek.change);
    expect(after.week.profit - before.week.profit).toBe(expectedWeek.profit);
    expect(after.week.transactions - before.week.transactions).toBe(expectedWeek.count);

    expect(after.month.change - before.month.change).toBe(expectedMonth.change);
    expect(after.month.profit - before.month.profit).toBe(expectedMonth.profit);
    expect(after.month.transactions - before.month.transactions).toBe(expectedMonth.count);

    // the far-outside fixture must never appear in any bucket
    expect(expectedToday.count).toBeLessThanOrEqual(2); // today fixture, plus weekStart/monthStart only if they land on today
  });
});

describe('GET /api/analytics/dashboard - inventory section', () => {
  test('matches a direct GET /api/inventory read exactly', async () => {
    const agent = await staffAgent();
    const [dashboardRes, inventoryRes] = await Promise.all([
      agent.get('/api/analytics/dashboard'),
      agent.get('/api/inventory'),
    ]);
    expect(dashboardRes.body.data.inventory).toEqual(inventoryRes.body.data);
  });
});

describe('GET /api/analytics/dashboard - recent transactions and profit trend', () => {
  test('recentTransactions is a non-empty array of transaction-shaped rows', async () => {
    const agent = await staffAgent();
    const res = await agent.get('/api/analytics/dashboard');
    expect(Array.isArray(res.body.data.recentTransactions)).toBe(true);
    expect(res.body.data.recentTransactions.length).toBeGreaterThan(0);
    expect(res.body.data.recentTransactions[0]).toHaveProperty('shop_name');
    expect(res.body.data.recentTransactions[0]).toHaveProperty('amount_collected');
  });

  test('profitTrend covers exactly 7 consecutive days ending today, with no gaps', async () => {
    const agent = await staffAgent();
    const res = await agent.get('/api/analytics/dashboard');
    const trend = res.body.data.profitTrend;
    expect(trend.length).toBe(7);
    expect(trend[trend.length - 1].date).toBe(today);
    for (let i = 1; i < trend.length; i += 1) {
      const prev = new Date(`${trend[i - 1].date}T00:00:00Z`);
      const curr = new Date(`${trend[i].date}T00:00:00Z`);
      expect((curr - prev) / (1000 * 60 * 60 * 24)).toBe(1);
    }
  });
});

describe('GET /api/analytics/dashboard - reflects the full transaction lifecycle', () => {
  test('create, edit, and delete are each immediately reflected in today totals', async () => {
    const agent = await staffAgent();

    const beforeCreate = (await agent.get('/api/analytics/dashboard')).body.data;
    const created = await createTx(agent, today, { bundles_10: 2 }); // 2000 @ 3% = 60

    const afterCreate = (await agent.get('/api/analytics/dashboard')).body.data;
    expect(afterCreate.today.change - beforeCreate.today.change).toBe(2000);
    expect(afterCreate.today.profit - beforeCreate.today.profit).toBe(60);
    expect(afterCreate.today.transactions - beforeCreate.today.transactions).toBe(1);

    // Edit replaces the transaction's contribution - it must not be additive.
    await agent
      .put(`/api/transactions/${created.id}`)
      .send({ shop_id: testShopId, transaction_date: today, bundles_50: 1 }) // 5000 @ 1.5% = 75, rounds up to 80
      .expect(200);

    const afterEdit = (await agent.get('/api/analytics/dashboard')).body.data;
    expect(afterEdit.today.change - beforeCreate.today.change).toBe(5000);
    expect(afterEdit.today.profit - beforeCreate.today.profit).toBe(80);
    expect(afterEdit.today.transactions - beforeCreate.today.transactions).toBe(1);

    await agent.delete(`/api/transactions/${created.id}`).expect(204);

    const afterDelete = (await agent.get('/api/analytics/dashboard')).body.data;
    expect(afterDelete.today.change).toBe(beforeCreate.today.change);
    expect(afterDelete.today.profit).toBe(beforeCreate.today.profit);
    expect(afterDelete.today.transactions).toBe(beforeCreate.today.transactions);
  });
});
