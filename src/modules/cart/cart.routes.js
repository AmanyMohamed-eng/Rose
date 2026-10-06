const express = require('express');
const router = express.Router();

const cartController = require('./cart.controller');
const authMiddleware = require('../../middleware/auth.middleware');

router.use(authMiddleware);

router.get('/', cartController.getCart);

router.get('/total', cartController.calculateTotal);

router.post('/items', cartController.addProduct);

router.patch(
  '/items/:productId',
  cartController.updateQuantity
);

router.delete(
  '/items/:productId',
  cartController.removeProduct
);

router.delete('/', cartController.clearCart);

module.exports = router;