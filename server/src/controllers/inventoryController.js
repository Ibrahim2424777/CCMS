const inventoryService = require('../services/inventoryService');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');

const VALID_BUNDLE_TYPES = [10, 50, 100];
const MAX_DELTA = 100000; // absurdly generous ceiling for a 4-5 person shop

const getSnapshot = asyncHandler(async (req, res) => {
  const snapshot = await inventoryService.getSnapshot();
  res.json({ data: snapshot });
});

// A positive delta adds stock (e.g. an initial count, a recount correction);
// a negative delta removes it. Same 0.01 (one-note) precision rule as
// transaction bundle quantities, since stock is still counted in real notes.
function validateAdjustBody(body) {
  const bundleType = Number(body.bundle_type);
  if (!VALID_BUNDLE_TYPES.includes(bundleType)) {
    throw new HttpError(400, 'bundle_type must be one of 10, 50, 100.', { code: 'VALIDATION_ERROR' });
  }

  if (typeof body.delta !== 'number' || !Number.isFinite(body.delta) || body.delta === 0) {
    throw new HttpError(400, 'delta must be a non-zero number.', { code: 'VALIDATION_ERROR' });
  }
  if (Math.abs(body.delta) > MAX_DELTA) {
    throw new HttpError(400, 'delta is unrealistically large.', { code: 'VALIDATION_ERROR' });
  }
  const scaledNotes = Math.round(body.delta * 100);
  if (Math.abs(scaledNotes - body.delta * 100) > 1e-6) {
    throw new HttpError(400, 'delta must be in increments of 0.01 (a whole number of notes).', {
      code: 'VALIDATION_ERROR',
    });
  }

  return { bundleType, delta: scaledNotes / 100 };
}

const adjust = asyncHandler(async (req, res) => {
  const { bundleType, delta } = validateAdjustBody(req.body || {});
  const updated = await inventoryService.manualAdjust(bundleType, delta);
  res.json({ data: updated });
});

module.exports = { getSnapshot, adjust };
