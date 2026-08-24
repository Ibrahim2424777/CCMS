const express = require('express');
const { checkConnection } = require('../config/db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const dbConnected = await checkConnection();
    res.json({
      status: 'ok',
      db: dbConnected ? 'connected' : 'error',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      db: 'error',
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
