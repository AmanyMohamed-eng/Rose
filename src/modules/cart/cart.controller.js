const cartService = require('./cart.service');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');

// Every handler is scoped to req.user.id — a customer can never address another customer's cart.

const getCart = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { cart: await cartService.getCart(req.user.id) } });
});

const addProduct = asyncHandler(async (req, res) => {
  const cart = await cartService.addProduct(req.user.id, req.body.productId, req.body.quantity);
  sendSuccess(res, { message: 'Product added to cart successfully', data: { cart } });
});

const updateQuantity = asyncHandler(async (req, res) => {
  const cart = await cartService.updateQuantity(req.user.id, req.params.productId, req.body.quantity);
  sendSuccess(res, { message: 'Cart quantity updated successfully', data: { cart } });
});

const removeProduct = asyncHandler(async (req, res) => {
  const cart = await cartService.removeProduct(req.user.id, req.params.productId);
  sendSuccess(res, { message: 'Product removed from cart successfully', data: { cart } });
});

const clearCart = asyncHandler(async (req, res) => {
  const cart = await cartService.clearCart(req.user.id);
  sendSuccess(res, { message: 'Cart cleared successfully', data: { cart } });
});

const calculateTotal = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await cartService.calculateTotal(req.user.id) });
});

module.exports = { getCart, addProduct, updateQuantity, removeProduct, clearCart, calculateTotal };
