const express = require('express');
const router = express.Router();

const orderController = require('./order.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const { allowRoles } = require('../../middleware/role.middleware');

router.use(authMiddleware);

router.post('/', allowRoles('customer'), orderController.createOrder);
router.get('/my', allowRoles('customer'), orderController.getMyOrders);
router.get('/:id', orderController.getOrder); 


router.patch('/:id/cancel', orderController.cancelOrder);

router.get('/florist/queue', allowRoles('florist'), orderController.getFloristQueue);
router.patch('/:id/prep-status', allowRoles('florist'), orderController.updatePrepStatus);

router.get('/', allowRoles('admin'), orderController.listOrders);
router.get('/admin/stats', allowRoles('admin'), orderController.getStats);
router.patch('/:id/status', allowRoles('admin'), orderController.updateStatus);
router.patch('/:id/assign', allowRoles('admin'), orderController.assignFlorist);

module.exports = router;