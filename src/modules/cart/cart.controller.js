const cartService = require('./cart.service');

const {
  validateAddProduct,
  validateUpdateQuantity,
} = require('./cart.validator');


// GET /api/v1/cart
const getCart = async (req, res, next) => {
  try {
    const cart = await cartService.getCart(req.user.id);

    res.status(200).json({
      cart,
    });
  } catch (error) {
    next(error);
  }
};


// POST /api/v1/cart/items
const addProduct = async (req, res, next) => {
  try {
    validateAddProduct(req.body);

    const { productId, quantity } = req.body;

    const cart = await cartService.addProduct(
      req.user.id,
      productId,
      quantity
    );

    res.status(200).json({
      message: 'Product added to cart successfully',
      cart,
    });
  } catch (error) {
    next(error);
  }
};


// DELETE /api/v1/cart/items/:productId
const removeProduct = async (req, res, next) => {
  try {
    const cart = await cartService.removeProduct(
      req.user.id,
      req.params.productId
    );

    res.status(200).json({
      message: 'Product removed from cart successfully',
      cart,
    });
  } catch (error) {
    next(error);
  }
};


// PATCH /api/v1/cart/items/:productId
const updateQuantity = async (req, res, next) => {
  try {
    validateUpdateQuantity(req.body);

    const { quantity } = req.body;

    const cart = await cartService.updateQuantity(
      req.user.id,
      req.params.productId,
      quantity
    );

    res.status(200).json({
      message: 'Cart quantity updated successfully',
      cart,
    });
  } catch (error) {
    next(error);
  }
};


// DELETE /api/v1/cart
const clearCart = async (req, res, next) => {
  try {
    const cart = await cartService.clearCart(req.user.id);

    res.status(200).json({
      message: 'Cart cleared successfully',
      cart,
    });
  } catch (error) {
    next(error);
  }
};


// GET /api/v1/cart/total
const calculateTotal = async (req, res, next) => {
  try {
    const result = await cartService.calculateTotal(req.user.id);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};


module.exports = {
  getCart,
  addProduct,
  removeProduct,
  updateQuantity,
  clearCart,
  calculateTotal,
};