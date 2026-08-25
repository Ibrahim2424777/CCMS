const express = require('express');
const inventoryController = require('../controllers/inventoryController');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

router.use(requireAuth);
router.get('/', inventoryController.getSnapshot);
router.post('/adjust', requireRole('ADMIN'), inventoryController.adjust);

module.exports = router;
