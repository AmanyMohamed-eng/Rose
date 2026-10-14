const router = require('express').Router();
const ctrl = require('./category.controller');
const v = require('./category.validator');
const validate = require('../../middleware/validate.middleware');
const authenticate = require('../../middleware/auth.middleware');
const { allowRoles } = require('../../middleware/role.middleware');
const { ROLES } = require('../../constants');

const adminOnly = [authenticate, allowRoles(ROLES.ADMIN)];

// ---- Admin ----
router.get('/admin/all', ...adminOnly, ctrl.listAllCategories);
router.post('/', ...adminOnly, validate({ body: v.create }), ctrl.createCategory);
router.patch('/:id/status', ...adminOnly, validate({ params: v.idParams }), ctrl.toggleCategoryStatus);
router.patch('/:id/order', ...adminOnly, validate({ params: v.idParams, body: v.setOrder }), ctrl.updateDisplayOrder);
router.patch('/:id/restore', ...adminOnly, validate({ params: v.idParams }), ctrl.restoreCategory);
router.patch('/:id', ...adminOnly, validate({ params: v.idParams, body: v.update }), ctrl.updateCategory);
router.delete('/:id', ...adminOnly, validate({ params: v.idParams }), ctrl.deleteCategory);

// ---- Public ----
router.get('/', ctrl.listCategories);
router.get('/:slug', validate({ params: v.slugParams }), ctrl.getCategory);

module.exports = router;
