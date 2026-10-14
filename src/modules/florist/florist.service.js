const FloristProfile = require('../../models/FloristProfile');
const User = require('../../models/User');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const InventoryItem = require('../../models/InventoryItem');
const AppError = require('../../utils/AppError');
const productService = require('../products/product.service');
const orderService = require('../orders/order.service');
const serializer = require('../orders/order.serializer');
const { paginationMeta, skipFor } = require('../../utils/pagination');
const { FLORIST_STATUS } = require('../../constants');

// ---------- Profile / verification (available to every florist, even while PENDING) ----------
const getProfile = async (userId) => {
  const profile = await FloristProfile.findOne({ user: userId }).populate('user', 'name email phone isActive');
  if (!profile) throw new AppError('Florist profile not found', 404);
  return profile;
};

const updateVerification = async (userId, data) => {
  const profile = await FloristProfile.findOne({ user: userId });
  if (!profile) throw new AppError('Florist profile not found', 404);
  if (profile.approvalStatus === FLORIST_STATUS.APPROVED) {
    throw new AppError('Your account is already verified. Contact support to change verified details.', 409);
  }
  profile.verification = { ...data, submittedAt: new Date() };
  profile.approvalStatus = FLORIST_STATUS.PENDING; // re-submission after rejection goes back to the admin queue
  profile.rejectionReason = undefined;
  profile.reviewedBy = undefined;
  profile.reviewedAt = undefined;
  await profile.save();
  return profile;
};

// ---------- Approved florists only (enforced in the router) ----------
const updateProfile = async (userId, data) => {
  const profile = await FloristProfile.findOne({ user: userId });
  if (!profile) throw new AppError('Florist profile not found', 404);
  Object.assign(profile, data);
  await profile.save();
  return profile;
};

const toggleAvailability = async (userId) => {
  const profile = await FloristProfile.findOne({ user: userId });
  if (!profile) throw new AppError('Florist profile not found', 404);
  profile.isAvailable = !profile.isAvailable;
  await profile.save();
  await User.updateOne({ _id: userId }, { isAvailable: profile.isAvailable });
  return profile;
};

// ---------- Own products ----------
const listProducts = (floristId, filters, page, limit) =>
  productService.listFloristProducts(floristId, filters, page, limit);

const getOwnProduct = async (floristId, productId) => {
  const product = await Product.findOne({ _id: productId, florist: floristId }).select('-createdBy').populate('category', 'name slug');
  if (!product) throw new AppError('Product not found', 404);
  return product;
};

/** Read-only view of the ingredients used by this florist's own products (no cost / supplier data). */
const listInventory = async (floristId) => {
  const products = await Product.find({ florist: floristId }).select('recipe.inventoryItem');
  const ids = [...new Set(products.flatMap((p) => p.recipe.map((r) => String(r.inventoryItem))))];
  if (!ids.length) return [];
  return InventoryItem.find({ _id: { $in: ids }, isActive: true })
    .select('name type unit quantity lowStockThreshold')
    .sort({ type: 1, name: 1 });
};

// ---------- Orders (fulfilment projection only) ----------
const getMyOrders = async (floristId, filters, page, limit) => {
  const query = { assignedFlorist: floristId };
  if (filters.status) query.status = filters.status;
  const [orders, total] = await Promise.all([
    Order.find(query).sort({ 'delivery.deliveryDate': 1, createdAt: 1 }).skip(skipFor(page, limit)).limit(limit).select(orderService.FLORIST_FIELDS),
    Order.countDocuments(query),
  ]);
  return { items: orders.map(serializer.toFloristView), pagination: paginationMeta(total, page, limit) };
};

const getDashboard = async (floristId) => {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

  const [queueCount, todayAssigned, inProgress, completedToday, upcoming] = await Promise.all([
    Order.countDocuments({ assignedFlorist: floristId, status: { $in: ['CONFIRMED', 'PREPARING'] } }),
    Order.countDocuments({ assignedFlorist: floristId, 'delivery.deliveryDate': { $gte: startOfDay, $lt: endOfDay } }),
    Order.countDocuments({ assignedFlorist: floristId, status: 'PREPARING' }),
    Order.countDocuments({
      assignedFlorist: floristId,
      statusHistory: { $elemMatch: { status: 'READY', changedBy: floristId, changedAt: { $gte: startOfDay } } },
    }),
    Order.find({
      assignedFlorist: floristId,
      status: { $in: ['CONFIRMED', 'PREPARING'] },
      'delivery.deliveryDate': { $gte: startOfDay },
    })
      .sort({ 'delivery.deliveryDate': 1 })
      .limit(3)
      .select(orderService.FLORIST_FIELDS),
  ]);

  return { queueCount, todayAssigned, inProgress, completedToday, upcoming: upcoming.map(serializer.toFloristView) };
};

module.exports = {
  getProfile, updateVerification, updateProfile, toggleAvailability, listProducts, getOwnProduct,
  listInventory, getMyOrders, getDashboard,
};
