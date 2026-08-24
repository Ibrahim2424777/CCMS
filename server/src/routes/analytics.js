const express = require('express');
const analyticsController = require('../controllers/analyticsController');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);
router.get('/dashboard', analyticsController.getDashboard);
router.get('/summary', analyticsController.getSummary);

module.exports = router;
