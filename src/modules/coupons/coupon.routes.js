const router = require('express').Router();
const ctrl = require('./coupon.controller');
const v = require('./coupon.validator');
const validate = require('../../middleware/validate.middleware');
const authenticate = require('../../middleware/auth.middleware');
const { allowRoles } = require('../../middleware/role.middleware');
const { ROLES } = require('../../constants');

router.use(authenticate);

// Customer
router.post('/validate', allowRoles(ROLES.CUSTOMER), validate({ body: v.validateCoupon }), ctrl.validateCoupon);

// Admin only
const admin = allowRoles(ROLES.ADMIN);
router.get('/', admin, validate({ query: v.list }), ctrl.list);
router.post('/', admin, validate({ body: v.create }), ctrl.create);
router.get('/:id', admin, validate({ params: v.idParams }), ctrl.get);
router.patch('/:id/status', admin, validate({ params: v.idParams }), ctrl.toggleStatus);
router.patch('/:id', admin, validate({ params: v.idParams, body: v.update }), ctrl.update);
router.delete('/:id', admin, validate({ params: v.idParams }), ctrl.remove);

module.exports = router;
