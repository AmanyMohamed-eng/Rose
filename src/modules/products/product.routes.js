const express = require('express');
const router = express.Router();

const productController = require('./product.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const { allowRoles } = require('../../middleware/role.middleware');


const adminOnly = [authMiddleware, allowRoles('admin')];

router.get('/admin/low-stock', ...adminOnly, productController.getLowStock);

router.post('/', ...adminOnly, productController.createProduct);
router.patch('/:id/featured', ...adminOnly, productController.toggleFeatured);
router.patch('/:id/stock', ...adminOnly, productController.setStock);
router.patch('/:id', ...adminOnly, productController.updateProduct);
router.delete('/:id', ...adminOnly, productController.deleteProduct);

router.get('/', productController.listProducts);
router.get('/:slug', productController.getProduct);

module.exports = router;