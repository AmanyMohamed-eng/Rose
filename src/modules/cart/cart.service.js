const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const AppError = require('../../utils/AppError');
const { CURRENCY } = require('../../constants');
const { round2 } = require('../../utils/helpers');

const POPULATE = {
  path: 'items.product',
  select: 'title slug price discountPrice images stockQuantity reservedQuantity isActive approvalStatus',
};

const buyable = (p) => p && p.isActive && p.approvalStatus !== 'PENDING' && p.approvalStatus !== 'REJECTED';

const summarise = (cart) => {
  let subtotal = 0;
  let itemsCount = 0;
  for (const item of cart.items) {
    if (!buyable(item.product)) continue;
    subtotal += item.product.finalPrice * item.quantity;
    itemsCount += item.quantity;
  }
  return { subtotal: round2(subtotal), itemsCount, currency: CURRENCY };
};

const loadCart = async (userId) => {
  let cart = await Cart.findOne({ user: userId }).populate(POPULATE);
  if (!cart) {
    try {
      await Cart.create({ user: userId, items: [] });
    } catch (err) {
      if (err.code !== 11000) throw err; // concurrent creation by the same user — fine
    }
    cart = await Cart.findOne({ user: userId }).populate(POPULATE);
  }
  return cart;
};

const withSummary = (cart) => ({ ...cart.toJSON(), summary: summarise(cart) });

const getCart = async (userId) => withSummary(await loadCart(userId));

const getBuyableProduct = async (productId) => {
  const product = await Product.findById(productId);
  if (!product) throw new AppError('Product not found', 404);
  if (!buyable(product)) throw new AppError('Product is not available', 400);
  return product;
};

const addProduct = async (userId, productId, quantity) => {
  const product = await getBuyableProduct(productId);
  const available = product.availableStock;

  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = new Cart({ user: userId, items: [] });

  const existing = cart.items.find((i) => i.product.toString() === productId);
  const newQuantity = (existing ? existing.quantity : 0) + quantity;

  if (newQuantity > available) throw new AppError('Requested quantity exceeds available stock', 409);
  if (newQuantity > 100) throw new AppError('Quantity cannot exceed 100 per product', 422);

  if (existing) existing.quantity = newQuantity;
  else cart.items.push({ product: productId, quantity });

  await cart.save();
  return getCart(userId);
};

const updateQuantity = async (userId, productId, quantity) => {
  const product = await getBuyableProduct(productId);
  if (quantity > product.availableStock) throw new AppError('Requested quantity exceeds available stock', 409);

  const cart = await Cart.findOne({ user: userId });
  const item = cart?.items.find((i) => i.product.toString() === productId);
  if (!item) throw new AppError('Product is not in the cart', 404);

  item.quantity = quantity;
  await cart.save();
  return getCart(userId);
};

const removeProduct = async (userId, productId) => {
  const cart = await Cart.findOne({ user: userId });
  const idx = cart ? cart.items.findIndex((i) => i.product.toString() === productId) : -1;
  if (idx === -1) throw new AppError('Product is not in the cart', 404);

  cart.items.splice(idx, 1);
  await cart.save();
  return getCart(userId);
};

const clearCart = async (userId) => {
  await Cart.updateOne({ user: userId }, { $set: { items: [] } });
  return getCart(userId);
};

/** Best-effort: drop ordered products from the cart after a successful checkout. */
const removeOrderedProducts = async (userId, productIds) => {
  await Cart.updateOne({ user: userId }, { $pull: { items: { product: { $in: productIds } } } }).catch(() => {});
};

const calculateTotal = async (userId) => {
  const cart = await loadCart(userId);
  const s = summarise(cart);
  return { subtotal: s.subtotal, total: s.subtotal, currency: s.currency, itemsCount: s.itemsCount };
};

module.exports = { getCart, addProduct, updateQuantity, removeProduct, clearCart, removeOrderedProducts, calculateTotal };
