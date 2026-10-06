const mongoose = require("mongoose");

const Cart = require("../../models/cart");
const Product = require("../../models/product");
const AppError = require("../../utils/AppError");

// Get user's cart
const getCart = async (userId) => {
  let cart = await Cart.findOne({ user: userId }).populate({
    path: "items.product",
    select: "title slug price image stockQuantity reservedQuantity isActive",
  });

  if (!cart) {
    cart = await Cart.create({
      user: userId,
      items: [],
    });

    cart = await Cart.findById(cart._id).populate({
      path: "items.product",
      select: "title slug price image stockQuantity reservedQuantity isActive",
    });
  }

  return cart;
};

// Add product to cart
const addProduct = async (userId, productId, quantity) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new AppError("Invalid product ID", 400);
  }

  const product = await Product.findById(productId);

  if (!product) {
    throw new AppError("Product not found", 404);
  }

  if (!product.isActive) {
    throw new AppError("Product is not available", 400);
  }

  const availableStock = product.stockQuantity - product.reservedQuantity;

  if (availableStock < quantity) {
    throw new AppError("Insufficient stock", 409);
  }

  let cart = await Cart.findOne({ user: userId });

  if (!cart) {
    cart = new Cart({
      user: userId,
      items: [],
    });
  }

  const existingItem = cart.items.find(
    (item) => item.product.toString() === productId,
  );

  if (existingItem) {
    const newQuantity = existingItem.quantity + quantity;

    if (newQuantity > availableStock) {
      throw new AppError("Requested quantity exceeds available stock", 409);
    }

    existingItem.quantity = newQuantity;
  } else {
    cart.items.push({
      product: productId,
      quantity,
    });
  }

  await cart.save();

  return getCart(userId);
};

// Remove product from cart
const removeProduct = async (userId, productId) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new AppError("Invalid product ID", 400);
  }

  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    throw new AppError("Cart not found", 404);
  }

  const itemIndex = cart.items.findIndex(
    (item) => item.product.toString() === productId,
  );

  if (itemIndex === -1) {
    throw new AppError("Product is not in the cart", 404);
  }

  cart.items.splice(itemIndex, 1);

  await cart.save();

  return getCart(userId);
};

// Update product quantity
const updateQuantity = async (userId, productId, quantity) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new AppError("Invalid product ID", 400);
  }

  const product = await Product.findById(productId);

  if (!product) {
    throw new AppError("Product not found", 404);
  }

  if (!product.isActive) {
    throw new AppError("Product is not available", 400);
  }

  const availableStock = product.stockQuantity - product.reservedQuantity;

  if (quantity > availableStock) {
    throw new AppError("Requested quantity exceeds available stock", 409);
  }

  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    throw new AppError("Cart not found", 404);
  }

  const item = cart.items.find((item) => item.product.toString() === productId);

  if (!item) {
    throw new AppError("Product is not in the cart", 404);
  }

  item.quantity = quantity;

  await cart.save();

  return getCart(userId);
};

// Clear cart
const clearCart = async (userId) => {
  const cart = await Cart.findOne({ user: userId });

  if (!cart) {
    throw new AppError("Cart not found", 404);
  }

  cart.items = [];

  await cart.save();

  return cart;
};

// Calculate cart total
const calculateTotal = async (userId) => {
  const cart = await Cart.findOne({ user: userId }).populate({
    path: "items.product",
    select: "title price isActive",
  });

  if (!cart) {
    throw new AppError("Cart not found", 404);
  }

  let total = 0;
  for (const item of cart.items) {
    if (!item.product) {
      continue;
    }

    if (!item.product.isActive) {
      continue;
    }

    total += item.product.price * item.quantity;
  }

  return {
    total,
    currency: "EGP",
    itemsCount: cart.items.length,
  };
};

module.exports = {
  getCart,
  addProduct,
  removeProduct,
  updateQuantity,
  clearCart,
  calculateTotal,
};
