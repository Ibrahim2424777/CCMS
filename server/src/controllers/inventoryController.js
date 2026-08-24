const inventoryService = require('../services/inventoryService');
const asyncHandler = require('../utils/asyncHandler');

const getSnapshot = asyncHandler(async (req, res) => {
  const snapshot = await inventoryService.getSnapshot();
  res.json({ data: snapshot });
});

module.exports = { getSnapshot };
