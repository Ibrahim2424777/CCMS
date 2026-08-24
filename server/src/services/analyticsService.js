const { pool } = require('../config/db');
const inventoryService = require('./inventoryService');
const transactionService = require('./transactionService');
const { BUNDLE_VALUES } = require('./businessLogic');
const {
  todayInPakistan,
  daysAgoInPakistan,
  startOfWeekInPakistan,
  startOfMonthInPakistan,
  daysBetween,
} = require('../utils/dateUtils');

const TREND_DAYS = 7;
const RECENT_TRANSACTIONS_LIMIT = 5;
const DEFAULT_TOP_SHOPS_LIMIT = 5;
const BUNDLE_TYPES = [10, 50, 100];

function toNumber(value) {
  return Number(value) || 0;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Today/week/month totals in a single conditionally-aggregated query (one
// round trip instead of three) using the existing (status, transaction_date)
// index. The outer WHERE uses the EARLIER of week-start/month-start - week
// start is not always inside the current month (e.g. the 1st of the month
// falling mid-week), so bounding by month-start alone could wrongly exclude
// rows the week total needs.
async function getPeriodTotals(today, weekStart, monthStart) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(total_change_value) FILTER (WHERE transaction_date = $1), 0) AS today_change,
       COALESCE(SUM(profit)             FILTER (WHERE transaction_date = $1), 0) AS today_profit,
       COUNT(*)                         FILTER (WHERE transaction_date = $1)     AS today_count,
       COUNT(DISTINCT shop_id)          FILTER (WHERE transaction_date = $1)     AS today_shops,

       COALESCE(SUM(total_change_value) FILTER (WHERE transaction_date >= $2), 0) AS week_change,
       COALESCE(SUM(profit)             FILTER (WHERE transaction_date >= $2), 0) AS week_profit,
       COUNT(*)                         FILTER (WHERE transaction_date >= $2)     AS week_count,

       COALESCE(SUM(total_change_value) FILTER (WHERE transaction_date >= $3), 0) AS month_change,
       COALESCE(SUM(profit)             FILTER (WHERE transaction_date >= $3), 0) AS month_profit,
       COUNT(*)                         FILTER (WHERE transaction_date >= $3)     AS month_count
     FROM transactions
     WHERE status = 'ACTIVE' AND transaction_date >= LEAST($2::date, $3::date)`,
    [today, weekStart, monthStart]
  );
  return rows[0];
}

// One row per day over the trend window, including days with no activity
// (COALESCE to 0 via a LEFT JOIN against a generated date series) so the
// chart has no gaps.
async function getProfitTrend(fromDate, toDate) {
  const { rows } = await pool.query(
    `SELECT d::date AS date, COALESCE(SUM(t.profit), 0) AS profit
     FROM generate_series($1::date, $2::date, '1 day'::interval) d
     LEFT JOIN transactions t ON t.transaction_date = d::date AND t.status = 'ACTIVE'
     GROUP BY d
     ORDER BY d`,
    [fromDate, toDate]
  );
  return rows.map((row) => ({ date: row.date, profit: toNumber(row.profit) }));
}

async function getDashboard() {
  const today = todayInPakistan();
  const weekStart = startOfWeekInPakistan();
  const monthStart = startOfMonthInPakistan();
  const trendStart = daysAgoInPakistan(TREND_DAYS - 1);

  const [totalsRow, profitTrend, inventory, recent] = await Promise.all([
    getPeriodTotals(today, weekStart, monthStart),
    getProfitTrend(trendStart, today),
    inventoryService.getSnapshot(),
    transactionService.listTransactions({ pageSize: RECENT_TRANSACTIONS_LIMIT }),
  ]);

  return {
    today: {
      change: toNumber(totalsRow.today_change),
      profit: toNumber(totalsRow.today_profit),
      transactions: toNumber(totalsRow.today_count),
      shops: toNumber(totalsRow.today_shops),
    },
    week: {
      change: toNumber(totalsRow.week_change),
      profit: toNumber(totalsRow.week_profit),
      transactions: toNumber(totalsRow.week_count),
    },
    month: {
      change: toNumber(totalsRow.month_change),
      profit: toNumber(totalsRow.month_profit),
      transactions: toNumber(totalsRow.month_count),
    },
    inventory,
    recentTransactions: recent.data,
    profitTrend,
  };
}

// Overall totals + bundle counts for the range in one query (MASTER CONTEXT
// section 17's metric list, minus top shops and the trend, which need their
// own queries).
async function getRangeTotals(from, to) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) AS transactions,
       COUNT(DISTINCT shop_id) AS unique_shops,
       COALESCE(SUM(total_change_value), 0) AS total_change,
       COALESCE(SUM(profit), 0) AS total_profit,
       COALESCE(AVG(total_change_value), 0) AS avg_transaction,
       COALESCE(AVG(profit), 0) AS avg_profit,
       COALESCE(SUM(bundles_10), 0) AS bundles_10,
       COALESCE(SUM(bundles_50), 0) AS bundles_50,
       COALESCE(SUM(bundles_100), 0) AS bundles_100
     FROM transactions
     WHERE status = 'ACTIVE' AND transaction_date BETWEEN $1 AND $2`,
    [from, to]
  );
  return rows[0];
}

async function getTopShops(from, to, limit) {
  const { rows } = await pool.query(
    `SELECT s.id AS shop_id, s.shop_name,
            COUNT(*) AS transactions,
            COALESCE(SUM(t.total_change_value), 0) AS total_change,
            COALESCE(SUM(t.profit), 0) AS total_profit
     FROM transactions t
     JOIN shops s ON s.id = t.shop_id
     WHERE t.status = 'ACTIVE' AND t.transaction_date BETWEEN $1 AND $2
     GROUP BY s.id, s.shop_name
     ORDER BY transactions DESC, total_change DESC
     LIMIT $3`,
    [from, to, limit]
  );
  return rows.map((row) => ({
    shopId: row.shop_id,
    shopName: row.shop_name,
    transactions: toNumber(row.transactions),
    totalChange: toNumber(row.total_change),
    totalProfit: toNumber(row.total_profit),
  }));
}

// Groups the trend by day for short ranges, week or month for longer ones,
// so a multi-month custom range doesn't render one point per day (MASTER
// CONTEXT section 18: "Day/week/month depending on selected period").
function chooseGroupBy(from, to) {
  const span = daysBetween(from, to);
  if (span <= 31) return 'day';
  if (span <= 180) return 'week';
  return 'month';
}

// One row per period over the range, zero-filled for periods with no
// activity (LEFT JOIN against a generated series, same pattern as the
// dashboard's profit trend) so charts never show gaps.
async function getTrend(from, to, groupBy) {
  const interval = { day: '1 day', week: '1 week', month: '1 month' }[groupBy];
  const truncUnit = groupBy;

  const { rows } = await pool.query(
    `SELECT d::date AS period,
            COALESCE(SUM(t.profit), 0) AS profit,
            COALESCE(SUM(t.total_change_value), 0) AS change
     FROM generate_series(date_trunc($3, $1::date), date_trunc($3, $2::date), $4::interval) d
     LEFT JOIN transactions t
       ON date_trunc($3, t.transaction_date) = d
       AND t.status = 'ACTIVE'
       AND t.transaction_date BETWEEN $1 AND $2
     GROUP BY d
     ORDER BY d`,
    [from, to, truncUnit, interval]
  );
  return rows.map((row) => ({
    period: row.period,
    profit: toNumber(row.profit),
    change: toNumber(row.change),
  }));
}

// The dedicated Analytics page (MASTER CONTEXT section 17): totals, top
// shops, bundle distribution, and a profit/change trend, all scoped to one
// caller-resolved date range. All four run concurrently.
async function getSummary({ from, to, topShopsLimit = DEFAULT_TOP_SHOPS_LIMIT }) {
  const groupBy = chooseGroupBy(from, to);

  const [totalsRow, topShops, trend] = await Promise.all([
    getRangeTotals(from, to),
    getTopShops(from, to, topShopsLimit),
    getTrend(from, to, groupBy),
  ]);

  const bundleDistribution = BUNDLE_TYPES.map((type) => {
    const count = toNumber(totalsRow[`bundles_${type}`]);
    return { bundleType: type, count, value: count * BUNDLE_VALUES[type] };
  });

  const transactions = toNumber(totalsRow.transactions);

  return {
    range: { from, to },
    totals: {
      transactions,
      uniqueShops: toNumber(totalsRow.unique_shops),
      totalChange: toNumber(totalsRow.total_change),
      totalProfit: toNumber(totalsRow.total_profit),
      avgTransaction: transactions > 0 ? round2(toNumber(totalsRow.avg_transaction)) : 0,
      avgProfit: transactions > 0 ? round2(toNumber(totalsRow.avg_profit)) : 0,
    },
    bundleDistribution,
    topShops,
    trend: { groupBy, points: trend },
  };
}

module.exports = { getDashboard, getSummary };
