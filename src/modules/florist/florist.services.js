const FloristProfile = require('../../models/florist');
const User = require('../../models/user');
const Product = require('../../models/product');
const Order = require('../../models/order');
const AppError = require('../../utils/AppError');

// Florist users may not have a profile document yet — create it lazily.
const getOrCreateProfile = async (userId) => {
  let profile = await FloristProfile.findOne({ user: userId });
  if (!profile) profile = await FloristProfile.create({ user: userId });
  return profile;
};

const getProfile = async (userId) => {
  await getOrCreateProfile(userId);
  return FloristProfile.findOne({ user: userId })
    .populate('user', 'name email phone isActive');
};

const updateProfile = async (userId, data) => {
  const allowed = ['bio', 'specialties', 'yearsExperience', 'shiftStart', 'shiftEnd', 'avatar'];
  const patch = {};
  allowed.forEach((k) => { if (data[k] !== undefined) patch[k] = data[k]; });

  const profile = await FloristProfile.findOneAndUpdate(
    { user: userId },
    patch,
    { new: true, runValidators: true, upsert: true, setDefaultsOnInsert: true }
  );
  return profile;
};

const toggleAvailability = async (userId) => {
  const profile = await getOrCreateProfile(userId);
  profile.isAvailable = !profile.isAvailable;
  await profile.save();
  await User.updateOne({ _id: userId }, { isAvailable: profile.isAvailable });
  return profile;
};

const listProducts = async (filters = {}, page = 1, limit = 20) => {
  const query = {};
  if (filters.category) query.category = filters.category;
  if (filters.search) query.$text = { $search: filters.search };

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Product.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('title slug stockQuantity reservedQuantity lowStockThreshold category images'),
    Product.countDocuments(query),
  ]);
  return { items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
};

const updateProductStock = async (productId, newQuantity, actorId) => {
  const product = await Product.findById(productId);
  if (!product) throw new AppError('Product not found', 404);
  if (!Number.isInteger(newQuantity) || newQuantity < 0) throw new AppError('Quantity cannot be negative', 400);
  if (newQuantity < product.reservedQuantity) {
    throw new AppError('Quantity cannot be below reserved amount', 409);
  }

  product.stockQuantity = newQuantity;
  await product.save();
  return product;
};

const getMyOrders = async (floristId, filters = {}, page = 1, limit = 10) => {
  const query = { assignedFlorist: floristId };
  if (filters.status) query.status = filters.status;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Order.find(query)
      .sort({ 'delivery.deliveryDate': 1, createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate('customer', 'name email phone'),
    Order.countDocuments(query),
  ]);
  return { items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
};

const getDashboard = async (floristId) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const [queueCount, todayAssigned, inProgress, completedToday] = await Promise.all([
    Order.countDocuments({
      assignedFlorist: floristId,
      status: { $in: ['CONFIRMED', 'PREPARING'] },
    }),
    Order.countDocuments({
      assignedFlorist: floristId,
      'delivery.deliveryDate': { $gte: startOfDay, $lt: endOfDay },
    }),
    Order.countDocuments({
      assignedFlorist: floristId,
      status: 'PREPARING',
    }),
    Order.countDocuments({
      assignedFlorist: floristId,
      status: { $in: ['READY', 'OUT_FOR_DELIVERY', 'DELIVERED'] },
      updatedAt: { $gte: startOfDay },
    }),
  ]);

  const upcoming = await Order.find({
    assignedFlorist: floristId,
    status: { $in: ['CONFIRMED', 'PREPARING'] },
    'delivery.deliveryDate': { $gte: startOfDay },
  })
    .sort({ 'delivery.deliveryDate': 1 })
    .limit(3)
    .select('orderNumber status delivery.deliveryDate delivery.slot items.title');

  return {
    queueCount,
    todayAssigned,
    inProgress,
    completedToday,
    upcoming,
  };
};

module.exports = {
  getProfile,
  updateProfile,
  toggleAvailability,
  listProducts,
  updateProductStock,
  getMyOrders,
  getDashboard,
};