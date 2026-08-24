const { pool } = require('../config/db');

const SAFE_COLUMNS = 'id, shop_name, normalized_shop_name, created_at, updated_at';

async function listShops({ search } = {}) {
  if (search && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    const { rows } = await pool.query(
      `SELECT ${SAFE_COLUMNS} FROM shops WHERE normalized_shop_name LIKE $1 ORDER BY shop_name ASC`,
      [term]
    );
    return rows;
  }
  const { rows } = await pool.query(`SELECT ${SAFE_COLUMNS} FROM shops ORDER BY shop_name ASC`);
  return rows;
}

// Prefix match for autocomplete (MASTER CONTEXT section 8's example: "f" ->
// Freshly/Fresh Mart/Fresh Bakery, "fre" narrows the same set) - small result
// set, minimal fields, fast on the indexed normalized_shop_name column.
async function searchShops(query, limit = 10) {
  const term = String(query || '').trim().toLowerCase();
  if (!term) return [];
  const { rows } = await pool.query(
    `SELECT id, shop_name FROM shops WHERE normalized_shop_name LIKE $1 ORDER BY shop_name ASC LIMIT $2`,
    [`${term}%`, limit]
  );
  return rows;
}

async function getShopById(id) {
  const { rows } = await pool.query(`SELECT ${SAFE_COLUMNS} FROM shops WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function createShop(shopName) {
  const { rows } = await pool.query(
    `INSERT INTO shops (shop_name) VALUES ($1) RETURNING ${SAFE_COLUMNS}`,
    [shopName]
  );
  return rows[0];
}

async function updateShop(id, shopName) {
  const { rows } = await pool.query(
    `UPDATE shops SET shop_name = $1 WHERE id = $2 RETURNING ${SAFE_COLUMNS}`,
    [shopName, id]
  );
  return rows[0] || null;
}

async function deleteShop(id) {
  const { rowCount } = await pool.query('DELETE FROM shops WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = { listShops, searchShops, getShopById, createShop, updateShop, deleteShop };
