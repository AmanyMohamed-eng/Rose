const router = require('express').Router();
const ctrl = require('./cart.controller');
const v = require('./cart.validator');
const validate = require('../../middleware/validate.middleware');
const authenticate = require('../../middleware/auth.middleware');
const { allowRoles } = require('../../middleware/role.middleware');
const { ROLES } = require('../../constants');

// Customers only.
router.use(authenticate, allowRoles(ROLES.CUSTOMER));

router.get('/', ctrl.getCart);
router.get('/total', ctrl.calculateTotal);
router.post('/items', validate({ body: v.addProduct }), ctrl.addProduct);
router.patch('/items/:productId', validate({ params: v.productParams, body: v.updateQuantity }), ctrl.updateQuantity);
router.delete('/items/:productId', validate({ params: v.productParams }), ctrl.removeProduct);
router.delete('/', ctrl.clearCart);

module.exports = router;
