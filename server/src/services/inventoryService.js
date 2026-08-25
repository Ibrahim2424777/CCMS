const { pool } = require('../config/db');
const { BUNDLE_VALUES, NOTES_PER_BUNDLE } = require('./businessLogic');
const withTransaction = require('../utils/withTransaction');
const HttpError = require('../utils/httpError');

const BUNDLE_TYPES = [10, 50, 100];

// Current snapshot: per-type bundle/note/monetary counts plus totals
// (MASTER CONTEXT section 11).
async function getSnapshot() {
  const { rows } = await pool.query('SELECT bundle_type, bundle_count FROM inventory ORDER BY bundle_type ASC');

  const bundles = rows.map((row) => ({
    bundle_type: row.bundle_type,
    bundle_count: row.bundle_count,
    note_count: row.bundle_count * NOTES_PER_BUNDLE,
    value: row.bundle_count * BUNDLE_VALUES[row.bundle_type],
  }));

  const totals = bundles.reduce(
    (acc, b) => ({
      bundle_count: acc.bundle_count + b.bundle_count,
      note_count: acc.note_count + b.note_count,
      value: acc.value + b.value,
    }),
    { bundle_count: 0, note_count: 0, value: 0 }
  );

  return { bundles, totals };
}

// Locks the inventory rows for the given bundle types, in a fixed ascending
// order, so two concurrent transactions touching overlapping bundle types can
// never deadlock against each other (ARCHITECTURE.md section 13). Must be
// called with a client already inside a transaction (BEGIN). Returns a map
// of bundle_type -> current bundle_count for the locked rows.
async function lockInventoryRows(client, bundleTypes) {
  const sorted = [...new Set(bundleTypes)].sort((a, b) => a - b);
  if (sorted.length === 0) return {};

  const { rows } = await client.query(
    'SELECT bundle_type, bundle_count FROM inventory WHERE bundle_type = ANY($1) ORDER BY bundle_type ASC FOR UPDATE',
    [sorted]
  );
  const map = {};
  for (const row of rows) map[row.bundle_type] = row.bundle_count;
  return map;
}

// Applies a signed adjustment to inventory for each requested bundle type:
// sign = -1 to deduct (a new transaction consuming stock), sign = +1 to
// restore (an edit/delete giving stock back). Must run inside a transaction
// whose rows were already locked via lockInventoryRows.
async function adjustInventory(client, bundleCounts, sign) {
  for (const type of BUNDLE_TYPES) {
    const qty = bundleCounts[`bundles_${type}`] || 0;
    if (qty !== 0) {
      // eslint-disable-next-line no-await-in-loop
      await client.query('UPDATE inventory SET bundle_count = bundle_count + $1 WHERE bundle_type = $2', [
        sign * qty,
        type,
      ]);
    }
  }
}

// Manual stock correction (e.g. an initial stock count, or a physical
// recount) - independent of the transaction pipeline. Locks the single row
// so it can never race a concurrent transaction or another manual adjustment
// touching the same bundle type (same FOR UPDATE pattern as
// lockInventoryRows, just for one row outside of a transaction-creation
// flow).
async function manualAdjust(bundleType, delta) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT bundle_count FROM inventory WHERE bundle_type = $1 FOR UPDATE', [
      bundleType,
    ]);
    const current = rows[0].bundle_count;
    const next = current + delta;
    if (next < 0) {
      throw new HttpError(
        409,
        `Cannot remove ${Math.abs(delta)} bundles - only ${current} currently in stock.`,
        { code: 'INSUFFICIENT_INVENTORY' }
      );
    }

    const { rows: updated } = await client.query(
      'UPDATE inventory SET bundle_count = $1 WHERE bundle_type = $2 RETURNING *',
      [next, bundleType]
    );
    return updated[0];
  });
}

module.exports = { getSnapshot, lockInventoryRows, adjustInventory, manualAdjust, BUNDLE_TYPES };
