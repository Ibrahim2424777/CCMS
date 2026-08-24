const express = require('express');
const shopController = require('../controllers/shopController');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

router.use(requireAuth);

// /search must come before /:id or "search" would be parsed as an id.
router.get('/search', shopController.search);
router.get('/', shopController.list);
router.get('/:id', shopController.getOne);
router.post('/', shopController.create);
router.put('/:id', shopController.update);
router.delete('/:id', requireRole('ADMIN'), shopController.remove);

module.exports = router;
