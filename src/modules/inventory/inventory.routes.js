const router = require('express').Router();
const ctrl = require('./inventory.controller');
const v = require('./inventory.validator');
const validate = require('../../middleware/validate.middleware');
const authenticate = require('../../middleware/auth.middleware');
const { allowRoles } = require('../../middleware/role.middleware');
const { ROLES } = require('../../constants');

// Admin only. (Florists get a read-only, cost-free view via GET /florist/inventory.)
router.use(authenticate, allowRoles(ROLES.ADMIN));

router.get('/low-stock', ctrl.lowStock);
router.get('/', validate({ query: v.list }), ctrl.list);
router.post('/', validate({ body: v.create }), ctrl.create);
router.get('/:id', validate({ params: v.idParams }), ctrl.get);
router.patch('/:id/stock', validate({ params: v.idParams, body: v.adjust }), ctrl.adjust);
router.patch('/:id', validate({ params: v.idParams, body: v.update }), ctrl.update);
router.delete('/:id', validate({ params: v.idParams }), ctrl.deactivate);

module.exports = router;
