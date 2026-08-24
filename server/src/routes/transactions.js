const express = require('express');
const transactionController = require('../controllers/transactionController');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', transactionController.list);
router.get('/:id', transactionController.getOne);
router.post('/', transactionController.create);
router.put('/:id', transactionController.update);
router.delete('/:id', transactionController.remove);

module.exports = router;
