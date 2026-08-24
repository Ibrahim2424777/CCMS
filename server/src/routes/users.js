const express = require('express');
const userController = require('../controllers/userController');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// Admin user management foundation (MASTER CONTEXT section 6: staff must not
// perform administrative operations). No DELETE - users are deactivated
// (is_active), never removed, so financial history (created_by) is preserved.
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', userController.list);
router.post('/', userController.create);
router.put('/:id', userController.update);

module.exports = router;
