const express = require('express');
const inventoryController = require('../controllers/inventoryController');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);
router.get('/', inventoryController.getSnapshot);

module.exports = router;
