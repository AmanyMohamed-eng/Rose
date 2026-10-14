const router = require('express').Router();
const ctrl = require('./florist.controller');
const v = require('./florist.validator');
const pv = require('../products/product.validator');
const ov = require('../orders/order.validator');
const validate = require('../../middleware/validate.middleware');
const authenticate = require('../../middleware/auth.middleware');
const { allowRoles, requireApprovedFlorist } = require('../../middleware/role.middleware');
const { ROLES } = require('../../constants');

router.use(authenticate, allowRoles(ROLES.FLORIST));

// ---- Any florist (including PENDING / REJECTED): see status and (re)submit verification ----
router.get('/profile', ctrl.getProfile);
router.put('/verification', validate({ body: v.updateVerification }), ctrl.updateVerification);

// ---- Approved florists only ----
router.use(requireApprovedFlorist);

router.get('/dashboard', ctrl.getDashboard);
router.patch('/profile', validate({ body: v.updateProfile }), ctrl.updateProfile);
router.patch('/availability', ctrl.toggleAvailability);

router.get('/products', validate({ query: v.productListQuery }), ctrl.listProducts);
router.post('/products', validate({ body: pv.floristCreate }), ctrl.createProduct);
router.get('/products/:productId', validate({ params: pv.productIdParams }), ctrl.getProduct);
router.patch('/products/:productId/stock', validate({ params: pv.productIdParams, body: pv.setStock }), ctrl.updateProductStock);
router.patch('/products/:productId', validate({ params: pv.productIdParams, body: pv.floristUpdate }), ctrl.updateProduct);
router.delete('/products/:productId', validate({ params: pv.productIdParams }), ctrl.deleteProduct);

router.get('/inventory', ctrl.listInventory);

router.get('/orders', validate({ query: ov.floristQueueQuery }), ctrl.getMyOrders);

module.exports = router;
