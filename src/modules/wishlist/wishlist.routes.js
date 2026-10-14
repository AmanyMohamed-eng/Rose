const router = require('express').Router();
const ctrl = require('./wishlist.controller');
const v = require('./wishlist.validator');
const validate = require('../../middleware/validate.middleware');
const authenticate = require('../../middleware/auth.middleware');
const { allowRoles } = require('../../middleware/role.middleware');
const { ROLES } = require('../../constants');

// Customers only; every query is scoped to req.user.id.
router.use(authenticate, allowRoles(ROLES.CUSTOMER));

router.get('/', validate({ query: v.listQuery }), ctrl.getWishlist);
router.delete('/', ctrl.clearWishlist);
router.get('/check/:productId', validate({ params: v.productParams }), ctrl.checkWishlist);
router.post('/:productId', validate({ params: v.productParams }), ctrl.addProduct);
router.delete('/:productId', validate({ params: v.productParams }), ctrl.removeProduct);

module.exports = router;
