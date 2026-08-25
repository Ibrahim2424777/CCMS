const { Pool, types } = require('pg');
const env = require('./env');

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of pg's default
// JS Date objects. This process's system timezone is Asia/Karachi (+5), so
// pg's default parser builds a Date at local midnight - once Express
// serializes that via toISOString() for JSON, it becomes the PREVIOUS day in
// UTC (e.g. stored '2026-08-10' comes back as "2026-08-09T19:00:00.000Z"),
// silently shifting every transaction_date by a day for any API consumer.
// A plain string sidesteps the conversion entirely and is still accepted
// correctly as a bound parameter for DATE columns on the way back in.
types.setTypeParser(types.builtins.DATE, (value) => value);

// pg's default parser returns NUMERIC columns (money, commission_rate,
// bundle quantities, SUM() aggregates) as strings, to avoid silently losing
// precision on values bigger than a JS float can represent exactly. Every
// value in this schema is a 2-4 decimal-place figure well within float
// precision, and the codebase was already working around the string default
// with scattered Number()/toNumber() calls at nearly every read site (money
// formatting, analytics aggregates, and now fractional bundle-quantity math
// in transactionService.js, where string values would silently corrupt
// inventory-restore arithmetic via JS's string-concatenation "+" operator).
// Parsing centrally here removes an entire class of bug instead of relying
// on every call site remembering to convert.
types.setTypeParser(types.builtins.NUMERIC, (value) => parseFloat(value));

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.dbSsl ? { rejectUnauthorized: false } : false,
});

async function checkConnection() {
  const result = await pool.query('SELECT 1 AS ok');
  return result.rows[0].ok === 1;
}

module.exports = { pool, checkConnection };
