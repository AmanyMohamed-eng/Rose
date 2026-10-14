const express = require('express');
const router = express.Router();

const orderController = require('./order.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const { allowRoles } = require('../../middleware/role.middleware');

router.use(authMiddleware);

// NOTE: static paths must be declared BEFORE the "/:id" routes,
// otherwise "/florist/queue" and "/admin/stats" are captured by "/:id".
router.post('/', allowRoles('customer'), orderController.createOrder);
router.get('/my', allowRoles('customer'), orderController.getMyOrders);

router.get('/florist/queue', allowRoles('florist'), orderController.getFloristQueue);
router.get('/admin/stats', allowRoles('admin'), orderController.getAdminStats);
router.get('/', allowRoles('admin'), orderController.listOrders);

router.get('/:id', orderController.getOrder);
router.patch('/:id/cancel', orderController.cancelOrder);
router.patch('/:id/prep-status', allowRoles('florist'), orderController.updatePrepStatus);
router.patch('/:id/status', allowRoles('admin'), orderController.updateStatus);
router.patch('/:id/assign', allowRoles('admin'), orderController.assignFlorist);

module.exports = router;
