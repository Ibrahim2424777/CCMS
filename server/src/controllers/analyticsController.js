const analyticsService = require('../services/analyticsService');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { isValidDateString, resolveDateRange, VALID_RANGES } = require('../utils/dateUtils');

const MAX_TOP_SHOPS_LIMIT = 20;

const getDashboard = asyncHandler(async (req, res) => {
  const dashboard = await analyticsService.getDashboard();
  res.json({ data: dashboard });
});

const getSummary = asyncHandler(async (req, res) => {
  const { range, from: customFrom, to: customTo, limit } = req.query;

  if (!VALID_RANGES.includes(range)) {
    throw new HttpError(400, `range must be one of: ${VALID_RANGES.join(', ')}.`, { code: 'VALIDATION_ERROR' });
  }

  if (range === 'custom') {
    if (!isValidDateString(customFrom) || !isValidDateString(customTo)) {
      throw new HttpError(400, 'A valid from and to date are required for a custom range.', {
        code: 'VALIDATION_ERROR',
      });
    }
    if (customFrom > customTo) {
      throw new HttpError(400, 'from must not be after to.', { code: 'VALIDATION_ERROR' });
    }
  }

  let topShopsLimit;
  if (limit !== undefined) {
    topShopsLimit = Number(limit);
    if (!Number.isInteger(topShopsLimit) || topShopsLimit <= 0 || topShopsLimit > MAX_TOP_SHOPS_LIMIT) {
      throw new HttpError(400, `limit must be an integer between 1 and ${MAX_TOP_SHOPS_LIMIT}.`, {
        code: 'VALIDATION_ERROR',
      });
    }
  }

  const { from, to } = resolveDateRange(range, customFrom, customTo);
  const summary = await analyticsService.getSummary({ from, to, topShopsLimit });

  res.json({ data: summary });
});

module.exports = { getDashboard, getSummary };
