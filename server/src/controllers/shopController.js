const shopService = require('../services/shopService');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const parseId = require('../utils/parseId');

function validateShopName(name) {
  if (!name || !String(name).trim()) {
    throw new HttpError(400, 'Shop name is required.', { code: 'VALIDATION_ERROR' });
  }
  const trimmed = String(name).trim();
  if (trimmed.length > 150) {
    throw new HttpError(400, 'Shop name must be 150 characters or fewer.', { code: 'VALIDATION_ERROR' });
  }
  return trimmed;
}

const list = asyncHandler(async (req, res) => {
  const shops = await shopService.listShops({ search: req.query.search });
  res.json({ data: shops });
});

const search = asyncHandler(async (req, res) => {
  const results = await shopService.searchShops(req.query.q);
  res.json({ data: results });
});

const getOne = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'shop id');
  const shop = await shopService.getShopById(id);
  if (!shop) throw new HttpError(404, 'Shop not found.', { code: 'NOT_FOUND' });
  res.json({ data: shop });
});

const create = asyncHandler(async (req, res) => {
  const name = validateShopName(req.body?.shop_name);

  let shop;
  try {
    shop = await shopService.createShop(name);
  } catch (err) {
    if (err.code === '23505') {
      throw new HttpError(409, 'A shop with this name already exists.', { code: 'DUPLICATE_SHOP' });
    }
    throw err;
  }
  res.status(201).json({ data: shop });
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'shop id');
  const name = validateShopName(req.body?.shop_name);

  let shop;
  try {
    shop = await shopService.updateShop(id, name);
  } catch (err) {
    if (err.code === '23505') {
      throw new HttpError(409, 'A shop with this name already exists.', { code: 'DUPLICATE_SHOP' });
    }
    throw err;
  }

  if (!shop) throw new HttpError(404, 'Shop not found.', { code: 'NOT_FOUND' });
  res.json({ data: shop });
});

const remove = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'shop id');

  let deleted;
  try {
    deleted = await shopService.deleteShop(id);
  } catch (err) {
    if (err.code === '23503') {
      throw new HttpError(409, 'This shop has transaction history and cannot be deleted.', {
        code: 'SHOP_HAS_TRANSACTIONS',
      });
    }
    throw err;
  }

  if (!deleted) throw new HttpError(404, 'Shop not found.', { code: 'NOT_FOUND' });
  res.status(204).end();
});

module.exports = { list, search, getOne, create, update, remove };
