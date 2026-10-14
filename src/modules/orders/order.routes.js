const router = require('express').Router();
const ctrl = require('./order.controller');
const v = require('./order.validator');
const validate = require('../../middleware/validate.middleware');
const authenticate = require('../../middleware/auth.middleware');
const { allowRoles, requireApprovedFlorist } = require('../../middleware/role.middleware');
const { ROLES } = require('../../constants');

const customer = allowRoles(ROLES.CUSTOMER);
const admin = allowRoles(ROLES.ADMIN);
const customerOrAdmin = allowRoles(ROLES.CUSTOMER, ROLES.ADMIN);

router.use(authenticate);

// ---- Static paths first (they must not be captured by /:id) ----
router.post('/', customer, validate({ body: v.createOrder }), ctrl.createOrder);
router.get('/my', customer, validate({ query: v.myOrdersQuery }), ctrl.getMyOrders);
router.get('/florist/queue', requireApprovedFlorist, ctrl.getFloristQueue);
router.get('/admin/stats', admin, ctrl.getAdminStats);
router.get('/', admin, validate({ query: v.adminListQuery }), ctrl.listOrders);

// ---- By id ----
// Florists are deliberately NOT allowed on GET /:id: they only see the fulfilment projection (/florist/queue).
router.get('/:id', customerOrAdmin, validate({ params: v.idParams }), ctrl.getOrder);
router.get('/:id/track', customerOrAdmin, validate({ params: v.idParams }), ctrl.trackOrder);
router.patch('/:id/cancel', customerOrAdmin, validate({ params: v.idParams, body: v.cancel }), ctrl.cancelOrder);

router.patch('/:id/prep-status', requireApprovedFlorist, validate({ params: v.idParams, body: v.prepStatus }), ctrl.updatePrepStatus);

router.patch('/:id/status', admin, validate({ params: v.idParams, body: v.updateStatus }), ctrl.updateStatus);
router.patch('/:id/assign', admin, validate({ params: v.idParams, body: v.assignFlorist }), ctrl.assignFlorist);
router.patch('/:id/payment', admin, validate({ params: v.idParams, body: v.payment }), ctrl.updatePayment);

module.exports = router;
