const { pool } = require('../config/db');
const withTransaction = require('../utils/withTransaction');
const inventoryService = require('./inventoryService');
const HttpError = require('../utils/httpError');
const {
  calculateBundleValue,
  calculateCommissionRate,
  calculateProfit,
  calculateAmountCollected,
} = require('./businessLogic');

const BUNDLE_TYPES = inventoryService.BUNDLE_TYPES;

function bundleTypesUsedBy(bundleCounts) {
  return BUNDLE_TYPES.filter((type) => (bundleCounts[`bundles_${type}`] || 0) > 0);
}

function assertSufficient(available, requestedType, requestedQty) {
  const have = available[requestedType] || 0;
  if (requestedQty > have) {
    throw new HttpError(
      409,
      `Not enough Rs. ${requestedType} bundles available. Requested ${requestedQty}, available ${have}.`,
      { code: 'INSUFFICIENT_INVENTORY' }
    );
  }
}

async function recordEdit(client, existing, editType, editedBy) {
  await client.query(
    `INSERT INTO transaction_edits
      (transaction_id, previous_shop_id, previous_transaction_date, previous_bundles_10, previous_bundles_50, previous_bundles_100,
       previous_total_change_value, previous_commission_rate, previous_profit, previous_amount_collected, edit_type, edited_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      existing.id,
      existing.shop_id,
      existing.transaction_date,
      existing.bundles_10,
      existing.bundles_50,
      existing.bundles_100,
      existing.total_change_value,
      existing.commission_rate,
      existing.profit,
      existing.amount_collected,
      editType,
      editedBy,
    ]
  );
}

// Creates a transaction and deducts inventory atomically (MASTER CONTEXT
// sections 12-13): if inventory is insufficient, nothing is written at all.
// profitOverride (admin-only, validated by the controller) replaces the
// auto-calculated profit when provided; commission_rate still always
// records which standard tier the bundle mix falls into, and
// amount_collected is always total_change_value + the profit actually
// stored, whichever it is - chk_amount_collected_math stays satisfied.
async function createTransaction({
  shop_id,
  transaction_date,
  bundles_10,
  bundles_50,
  bundles_100,
  profitOverride,
  created_by,
}) {
  const bundleCounts = { bundles_10, bundles_50, bundles_100 };
  const touchedTypes = bundleTypesUsedBy(bundleCounts);

  return withTransaction(async (client) => {
    const available = await inventoryService.lockInventoryRows(client, touchedTypes);
    for (const type of touchedTypes) {
      assertSufficient(available, type, bundleCounts[`bundles_${type}`]);
    }

    const totalChangeValue = calculateBundleValue(bundleCounts);
    const commissionRate = calculateCommissionRate(bundleCounts);
    const profitOverridden = profitOverride !== null && profitOverride !== undefined;
    const profit = profitOverridden ? profitOverride : calculateProfit(totalChangeValue, commissionRate);
    const amountCollected = calculateAmountCollected(totalChangeValue, profit);

    const { rows } = await client.query(
      `INSERT INTO transactions
        (shop_id, transaction_date, bundles_10, bundles_50, bundles_100,
         total_change_value, commission_rate, profit, profit_overridden, amount_collected, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        shop_id,
        transaction_date,
        bundles_10,
        bundles_50,
        bundles_100,
        totalChangeValue,
        commissionRate,
        profit,
        profitOverridden,
        amountCollected,
        created_by,
      ]
    );

    await inventoryService.adjustInventory(client, bundleCounts, -1);

    return rows[0];
  });
}

// Edits a transaction (MASTER CONTEXT section 14):
//   1. Restore old quantities  2. Validate new quantities against the
//   restored availability  3. Deduct new quantities  4-7. Recalculate all
//   financial values  8. Save atomically, with a before-snapshot recorded to
//   transaction_edits for auditability.
// Steps 1+3 are applied as a single net delta per bundle type (restore minus
// deduct), which is mathematically identical but avoids two writes where one
// suffices - the *validation* is still explicitly computed against the
// restored-availability figure, matching the conceptual order in the brief.
async function updateTransaction(
  id,
  { shop_id, transaction_date, bundles_10, bundles_50, bundles_100, profitOverride, updated_by }
) {
  const newBundles = { bundles_10, bundles_50, bundles_100 };

  return withTransaction(async (client) => {
    const { rows: txRows } = await client.query('SELECT * FROM transactions WHERE id = $1 FOR UPDATE', [id]);
    const existing = txRows[0];
    if (!existing) return null;

    if (existing.status !== 'ACTIVE') {
      throw new HttpError(409, 'This transaction has been voided and cannot be edited.', {
        code: 'TRANSACTION_VOIDED',
      });
    }

    const oldBundles = {
      bundles_10: existing.bundles_10,
      bundles_50: existing.bundles_50,
      bundles_100: existing.bundles_100,
    };

    const touchedTypes = [...new Set([...bundleTypesUsedBy(oldBundles), ...bundleTypesUsedBy(newBundles)])];
    const available = await inventoryService.lockInventoryRows(client, touchedTypes);

    // Step 1 (conceptually): what would be free if the old quantities were restored first.
    const afterRestore = {};
    for (const type of touchedTypes) {
      afterRestore[type] = (available[type] || 0) + (oldBundles[`bundles_${type}`] || 0);
    }

    // Step 2: validate the new quantities against that restored availability.
    for (const type of touchedTypes) {
      const needed = newBundles[`bundles_${type}`] || 0;
      if (needed > afterRestore[type]) {
        throw new HttpError(
          409,
          `Not enough Rs. ${type} bundles available. Requested ${needed}, available ${afterRestore[type]}.`,
          { code: 'INSUFFICIENT_INVENTORY' }
        );
      }
    }

    // Steps 1+3: apply restore-and-deduct as one net delta per touched type.
    for (const type of touchedTypes) {
      const delta = (oldBundles[`bundles_${type}`] || 0) - (newBundles[`bundles_${type}`] || 0);
      if (delta !== 0) {
        // eslint-disable-next-line no-await-in-loop
        await client.query('UPDATE inventory SET bundle_count = bundle_count + $1 WHERE bundle_type = $2', [
          delta,
          type,
        ]);
      }
    }

    // Steps 4-7: recalculate. profitOverride (admin-only, validated by the
    // controller) replaces the auto-calculated profit when provided;
    // amount_collected is always derived from whichever profit is actually
    // stored, so chk_amount_collected_math stays satisfied either way.
    const totalChangeValue = calculateBundleValue(newBundles);
    const commissionRate = calculateCommissionRate(newBundles);
    const profitOverridden = profitOverride !== null && profitOverride !== undefined;
    const profit = profitOverridden ? profitOverride : calculateProfit(totalChangeValue, commissionRate);
    const amountCollected = calculateAmountCollected(totalChangeValue, profit);

    await recordEdit(client, existing, 'UPDATE', updated_by);

    const { rows } = await client.query(
      `UPDATE transactions SET
         shop_id = $1, transaction_date = $2, bundles_10 = $3, bundles_50 = $4, bundles_100 = $5,
         total_change_value = $6, commission_rate = $7, profit = $8, profit_overridden = $9,
         amount_collected = $10, updated_by = $11
       WHERE id = $12
       RETURNING *`,
      [
        shop_id,
        transaction_date,
        bundles_10,
        bundles_50,
        bundles_100,
        totalChangeValue,
        commissionRate,
        profit,
        profitOverridden,
        amountCollected,
        updated_by,
        id,
      ]
    );

    return rows[0];
  });
}

// Deletes (soft) a transaction: restores its bundles to inventory and marks
// it VOID rather than physically removing the row (MASTER CONTEXT section 15;
// soft-delete confirmed in ARCHITECTURE.md section 21).
async function voidTransaction(id, voidedBy) {
  return withTransaction(async (client) => {
    const { rows: txRows } = await client.query('SELECT * FROM transactions WHERE id = $1 FOR UPDATE', [id]);
    const existing = txRows[0];
    if (!existing) return null;

    if (existing.status !== 'ACTIVE') {
      throw new HttpError(409, 'This transaction has already been deleted.', { code: 'ALREADY_VOIDED' });
    }

    const bundleCounts = {
      bundles_10: existing.bundles_10,
      bundles_50: existing.bundles_50,
      bundles_100: existing.bundles_100,
    };
    const touchedTypes = bundleTypesUsedBy(bundleCounts);
    await inventoryService.lockInventoryRows(client, touchedTypes);
    await inventoryService.adjustInventory(client, bundleCounts, +1);

    await recordEdit(client, existing, 'VOID', voidedBy);

    const { rows } = await client.query(
      `UPDATE transactions SET status = 'VOID', updated_by = $1 WHERE id = $2 RETURNING *`,
      [voidedBy, id]
    );
    return rows[0];
  });
}

const SORT_OPTIONS = {
  date_desc: 't.transaction_date DESC, t.id DESC',
  date_asc: 't.transaction_date ASC, t.id ASC',
  amount_desc: 't.amount_collected DESC, t.id DESC',
  amount_asc: 't.amount_collected ASC, t.id ASC',
};
const DEFAULT_SORT = 'date_desc';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Server-side filtering/search/sort/pagination (MASTER CONTEXT section 19:
// "Prefer server-side filtering/pagination for scalability"). Filters are
// combined with AND; all are optional. total_count is computed via a window
// function so the page of rows and the total both come back in one query.
async function listTransactions({ search, shopId, dateFrom, dateTo, sort, page, pageSize } = {}) {
  const conditions = [`t.status = 'ACTIVE'`];
  const params = [];

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    conditions.push(`s.shop_name ILIKE $${params.length}`);
  }
  if (shopId) {
    params.push(shopId);
    conditions.push(`t.shop_id = $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`t.transaction_date >= $${params.length}`);
  }
  if (dateTo) {
    params.push(dateTo);
    conditions.push(`t.transaction_date <= $${params.length}`);
  }

  const orderBy = SORT_OPTIONS[sort] || SORT_OPTIONS[DEFAULT_SORT];
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safePageSize = Math.min(Math.max(parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const offset = (safePage - 1) * safePageSize;

  params.push(safePageSize);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const { rows } = await pool.query(
    `SELECT t.*, s.shop_name, u.name AS created_by_name, COUNT(*) OVER() AS total_count
     FROM transactions t
     JOIN shops s ON s.id = t.shop_id
     JOIN users u ON u.id = t.created_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  const data = rows.map(({ total_count, ...rest }) => rest);

  return {
    data,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / safePageSize),
    },
  };
}

async function getTransactionById(id) {
  const { rows } = await pool.query(
    `SELECT t.*, s.shop_name, u.name AS created_by_name
     FROM transactions t
     JOIN shops s ON s.id = t.shop_id
     JOIN users u ON u.id = t.created_by
     WHERE t.id = $1`,
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  createTransaction,
  updateTransaction,
  voidTransaction,
  listTransactions,
  getTransactionById,
  VALID_SORTS: Object.keys(SORT_OPTIONS),
};
