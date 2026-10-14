const router = require('express').Router();
const ctrl = require('./product.controller');
const v = require('./product.validator');
const validate = require('../../middleware/validate.middleware');
const authenticate = require('../../middleware/auth.middleware');
const { allowRoles } = require('../../middleware/role.middleware');
const { productReviewRouter } = require('../review/review.routes');
const { ROLES } = require('../../constants');

const adminOnly = [authenticate, allowRoles(ROLES.ADMIN)];

// ---- Admin (static paths first so they never collide with /:slug) ----
router.get('/admin/low-stock', ...adminOnly, ctrl.getLowStock);
router.get('/admin/all', ...adminOnly, validate({ query: v.adminList }), ctrl.adminList);
router.get('/admin/:id', ...adminOnly, validate({ params: v.idParams }), ctrl.adminGet);

router.post('/', ...adminOnly, validate({ body: v.adminCreate }), ctrl.createProduct);
router.patch('/:id/featured', ...adminOnly, validate({ params: v.idParams }), ctrl.toggleFeatured);
router.patch('/:id/stock', ...adminOnly, validate({ params: v.idParams, body: v.setStock }), ctrl.setStock);
router.patch('/:id/approval', ...adminOnly, validate({ params: v.idParams, body: v.approval }), ctrl.setApproval);
router.patch('/:id', ...adminOnly, validate({ params: v.idParams, body: v.adminUpdate }), ctrl.updateProduct);
router.delete('/:id', ...adminOnly, validate({ params: v.idParams }), ctrl.deleteProduct);

// ---- Public ----
router.get('/', validate({ query: v.publicList }), ctrl.listProducts);
router.use('/:productId/reviews', productReviewRouter); // GET /products/:productId/reviews
router.get('/:slug', validate({ params: v.slugParams }), ctrl.getProduct);

module.exports = router;
