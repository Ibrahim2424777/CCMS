const transactionService = require('../services/transactionService');
const shopService = require('../services/shopService');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { isValidDateString, todayInPakistan } = require('../utils/dateUtils');
const parseId = require('../utils/parseId');

const MAX_BUNDLE_QUANTITY = 100000; // absurdly generous ceiling for a 4-5 person shop, well under NUMERIC(10,2)'s actual range

// A bundle can now be partial (e.g. 0.5 = half a bundle = 50 notes), but a
// note itself is still atomic - only increments of 0.01 (one note out of a
// 100-note bundle) are valid, matching the NUMERIC(10,2) column precision.
function validateBundleQuantity(value, label) {
  if (value === undefined || value === null) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpError(400, `${label} must be a number.`, { code: 'VALIDATION_ERROR' });
  }
  if (value < 0) {
    throw new HttpError(400, `${label} cannot be negative.`, { code: 'VALIDATION_ERROR' });
  }
  if (value > MAX_BUNDLE_QUANTITY) {
    throw new HttpError(400, `${label} is unrealistically large.`, { code: 'VALIDATION_ERROR' });
  }
  const scaledNotes = Math.round(value * 100);
  if (Math.abs(scaledNotes - value * 100) > 1e-6) {
    throw new HttpError(400, `${label} must be in increments of 0.01 (a whole number of notes).`, {
      code: 'VALIDATION_ERROR',
    });
  }
  return scaledNotes / 100;
}

// Shared by create (POST) and edit (PUT, full-replace semantics - the client
// sends the complete desired state, same as create, rather than a partial
// PATCH). Validates the request body and resolves the target shop.
async function resolveTransactionInput(body) {
  const shopId = parseId(body.shop_id, 'shop selection');

  const bundles_10 = validateBundleQuantity(body.bundles_10, 'Rs. 10 bundle quantity');
  const bundles_50 = validateBundleQuantity(body.bundles_50, 'Rs. 50 bundle quantity');
  const bundles_100 = validateBundleQuantity(body.bundles_100, 'Rs. 100 bundle quantity');

  if (bundles_10 === 0 && bundles_50 === 0 && bundles_100 === 0) {
    throw new HttpError(400, 'Select at least one bundle.', { code: 'VALIDATION_ERROR' });
  }

  if (!isValidDateString(body.transaction_date)) {
    throw new HttpError(400, 'A valid transaction date is required.', { code: 'VALIDATION_ERROR' });
  }
  if (body.transaction_date > todayInPakistan()) {
    throw new HttpError(400, 'Transaction date cannot be in the future.', { code: 'VALIDATION_ERROR' });
  }

  const shop = await shopService.getShopById(shopId);
  if (!shop) {
    throw new HttpError(404, 'Shop not found.', { code: 'SHOP_NOT_FOUND' });
  }

  return { shopId, shop, transaction_date: body.transaction_date, bundles_10, bundles_50, bundles_100 };
}

const create = asyncHandler(async (req, res) => {
  const { shopId, shop, transaction_date, bundles_10, bundles_50, bundles_100 } = await resolveTransactionInput(
    req.body || {}
  );

  let transaction;
  try {
    transaction = await transactionService.createTransaction({
      shop_id: shopId,
      transaction_date,
      bundles_10,
      bundles_50,
      bundles_100,
      created_by: req.user.id,
    });
  } catch (err) {
    if (err.code === '23503') {
      throw new HttpError(404, 'Shop not found.', { code: 'SHOP_NOT_FOUND' });
    }
    throw err;
  }

  res.status(201).json({ data: { ...transaction, shop_name: shop.shop_name } });
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'transaction id');
  const { shopId, shop, transaction_date, bundles_10, bundles_50, bundles_100 } = await resolveTransactionInput(
    req.body || {}
  );

  let transaction;
  try {
    transaction = await transactionService.updateTransaction(id, {
      shop_id: shopId,
      transaction_date,
      bundles_10,
      bundles_50,
      bundles_100,
      updated_by: req.user.id,
    });
  } catch (err) {
    if (err.code === '23503') {
      throw new HttpError(404, 'Shop not found.', { code: 'SHOP_NOT_FOUND' });
    }
    throw err;
  }

  if (!transaction) throw new HttpError(404, 'Transaction not found.', { code: 'NOT_FOUND' });
  res.json({ data: { ...transaction, shop_name: shop.shop_name } });
});

const remove = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'transaction id');
  const voided = await transactionService.voidTransaction(id, req.user.id);
  if (!voided) throw new HttpError(404, 'Transaction not found.', { code: 'NOT_FOUND' });
  res.status(204).end();
});

const list = asyncHandler(async (req, res) => {
  const { search, shop_id, date_from, date_to, sort, page, pageSize } = req.query;

  let shopId;
  if (shop_id !== undefined && shop_id !== '') {
    shopId = parseId(shop_id, 'shop filter');
  }

  if (date_from !== undefined && date_from !== '' && !isValidDateString(date_from)) {
    throw new HttpError(400, 'Invalid date_from.', { code: 'VALIDATION_ERROR' });
  }
  if (date_to !== undefined && date_to !== '' && !isValidDateString(date_to)) {
    throw new HttpError(400, 'Invalid date_to.', { code: 'VALIDATION_ERROR' });
  }
  if (sort !== undefined && !transactionService.VALID_SORTS.includes(sort)) {
    throw new HttpError(400, `Invalid sort. Use one of: ${transactionService.VALID_SORTS.join(', ')}.`, {
      code: 'VALIDATION_ERROR',
    });
  }

  const result = await transactionService.listTransactions({
    search,
    shopId,
    dateFrom: date_from || undefined,
    dateTo: date_to || undefined,
    sort,
    page,
    pageSize,
  });

  res.json(result);
});

const getOne = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'transaction id');
  const transaction = await transactionService.getTransactionById(id);
  if (!transaction) throw new HttpError(404, 'Transaction not found.', { code: 'NOT_FOUND' });
  res.json({ data: transaction });
});

module.exports = { create, update, remove, list, getOne };
