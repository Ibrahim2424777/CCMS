// Development seed data ONLY. Do not run against production.
// Safe to re-run: it truncates and re-inserts the domain tables it seeds.

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const env = require('../config/env');
const {
  calculateBundleValue,
  calculateCommissionRate,
  calculateProfit,
  calculateAmountCollected,
} = require('../services/businessLogic');

const DEV_PASSWORD = 'Password123!';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

const SEED_USERS = [
  { name: 'Ibrahim Hassan', email: 'admin@ccms.local', role: 'ADMIN' },
  { name: 'Bilal Hussain', email: 'bilal@ccms.local', role: 'STAFF' },
  { name: 'Ayesha Malik', email: 'ayesha@ccms.local', role: 'STAFF' },
  { name: 'Usman Tariq', email: 'usman@ccms.local', role: 'STAFF' },
];

const SEED_SHOPS = [
  'Freshly',
  'Fresh Mart',
  'Al-Karam General Store',
  'City Bakery',
  'Metro Traders',
  'Zaman Stationers',
];

const SEED_INVENTORY = { 10: 40, 50: 25, 100: 15 };

// bundle mixes + which seeded shop/user each transaction belongs to (by index)
const SEED_TRANSACTIONS = [
  { shop: 'Freshly', userIdx: 1, date: daysAgo(2), bundles_10: 2, bundles_50: 1, bundles_100: 0 },
  { shop: 'Fresh Mart', userIdx: 2, date: daysAgo(0), bundles_10: 5, bundles_50: 0, bundles_100: 0 },
  { shop: 'Al-Karam General Store', userIdx: 3, date: daysAgo(1), bundles_10: 0, bundles_50: 2, bundles_100: 1 },
  { shop: 'City Bakery', userIdx: 0, date: daysAgo(5), bundles_10: 1, bundles_50: 0, bundles_100: 1 },
  { shop: 'Metro Traders', userIdx: 1, date: daysAgo(0), bundles_10: 0, bundles_50: 0, bundles_100: 3 },
  { shop: 'Zaman Stationers', userIdx: 2, date: daysAgo(3), bundles_10: 3, bundles_50: 2, bundles_100: 1 },
  { shop: 'Freshly', userIdx: 3, date: daysAgo(7), bundles_10: 4, bundles_50: 0, bundles_100: 0 },
  { shop: 'Fresh Mart', userIdx: 0, date: daysAgo(1), bundles_10: 0, bundles_50: 4, bundles_100: 0 },
];

async function seed() {
  if (env.nodeEnv === 'production') {
    throw new Error('Refusing to run seed data against production (NODE_ENV=production).');
  }

  const pool = new Pool({
    connectionString: env.databaseUrl,
    ssl: env.dbSsl ? { rejectUnauthorized: false } : false,
  });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Clearing existing dev data...');
    await client.query('TRUNCATE transaction_edits, transactions, shops, users RESTART IDENTITY CASCADE');

    console.log('Seeding users...');
    const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
    const userIds = [];
    for (const u of SEED_USERS) {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`,
        [u.name, u.email, passwordHash, u.role]
      );
      userIds.push(rows[0].id);
    }

    console.log('Seeding shops...');
    const shopIds = {};
    for (const name of SEED_SHOPS) {
      const { rows } = await client.query(
        `INSERT INTO shops (shop_name) VALUES ($1) RETURNING id`,
        [name]
      );
      shopIds[name] = rows[0].id;
    }

    console.log('Seeding inventory snapshot...');
    for (const [bundleType, count] of Object.entries(SEED_INVENTORY)) {
      await client.query(`UPDATE inventory SET bundle_count = $1 WHERE bundle_type = $2`, [
        count,
        bundleType,
      ]);
    }

    console.log('Seeding transactions...');
    for (const tx of SEED_TRANSACTIONS) {
      const bundles = { bundles_10: tx.bundles_10, bundles_50: tx.bundles_50, bundles_100: tx.bundles_100 };
      const totalChangeValue = calculateBundleValue(bundles);
      const commissionRate = calculateCommissionRate(bundles);
      const profit = calculateProfit(totalChangeValue, commissionRate);
      const amountCollected = calculateAmountCollected(totalChangeValue, profit);

      await client.query(
        `INSERT INTO transactions
          (shop_id, transaction_date, bundles_10, bundles_50, bundles_100,
           total_change_value, commission_rate, profit, amount_collected, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          shopIds[tx.shop],
          tx.date,
          tx.bundles_10,
          tx.bundles_50,
          tx.bundles_100,
          totalChangeValue,
          commissionRate,
          profit,
          amountCollected,
          userIds[tx.userIdx],
        ]
      );
    }

    await client.query('COMMIT');

    console.log('\nSeed complete.');
    console.log(`  Users: ${SEED_USERS.length} (dev password for all: "${DEV_PASSWORD}")`);
    console.log(`  Shops: ${SEED_SHOPS.length}`);
    console.log(`  Transactions: ${SEED_TRANSACTIONS.length}`);
    console.log('  Inventory: 10 -> 40, 50 -> 25, 100 -> 15 bundles');
    console.log('\nThis is DEVELOPMENT DATA ONLY. Do not use these credentials in production.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err.message);
      process.exit(1);
    });
}

module.exports = { seed };
