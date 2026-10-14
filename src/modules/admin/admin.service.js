const User = require('../../models/User');
const FloristProfile = require('../../models/FloristProfile');
const AdminProfile = require('../../models/AdminProfile');
const Order = require('../../models/Order');
const SupportTicket = require('../../models/SupportTicket');
const Product = require('../../models/Product');
const AppError = require('../../utils/AppError');
const orderService = require('../orders/order.service');
const inventoryService = require('../inventory/inventory.service');
const { paginationMeta, skipFor } = require('../../utils/pagination');
const { escapeRegex } = require('../../utils/helpers');
const { ROLES, FLORIST_STATUS, ACTIVE_ORDER_STATUSES } = require('../../constants');

// ---------------------------------------------------------------------------
// Users (customers, florists, admins)
// ---------------------------------------------------------------------------
const listUsers = async (f, page, limit) => {
  const q = {};
  if (f.role) q.role = f.role;
  if (f.isActive !== undefined) q.isActive = f.isActive;
  if (f.search) {
    const rx = new RegExp(escapeRegex(f.search), 'i');
    q.$or = [{ name: rx }, { email: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(q).sort({ createdAt: -1 }).skip(skipFor(page, limit)).limit(limit),
    User.countDocuments(q),
  ]);
  return { items, pagination: paginationMeta(total, page, limit) };
};

const getUser = async (id) => {
  const user = await User.findById(id);
  if (!user) throw new AppError('User not found', 404);
  const out = { user };
  if (user.role === ROLES.FLORIST) out.floristProfile = await FloristProfile.findOne({ user: user._id });
  if (user.role === ROLES.CUSTOMER) out.orderCount = await Order.countDocuments({ customer: user._id });
  if (user.role === ROLES.ADMIN) out.adminProfile = await AdminProfile.findOne({ user: user._id });
  return out;
};

const isOwner = (id) => AdminProfile.exists({ user: id, isOwner: true });

const assertNotLastAdmin = async (targetId) => {
  const others = await User.countDocuments({ role: ROLES.ADMIN, isActive: true, _id: { $ne: targetId } });
  if (others === 0) throw new AppError('Cannot remove the last active admin', 409);
};

const updateUser = async (id, patch) => {
  const user = await User.findById(id);
  if (!user) throw new AppError('User not found', 404);
  if (patch.name !== undefined) user.name = patch.name;
  if (patch.phone !== undefined) user.phone = patch.phone;
  await user.save();
  return user;
};

const setActive = async (id, isActive, actorId) => {
  if (id === actorId) throw new AppError('You cannot change your own active status', 409);
  const user = await User.findById(id);
  if (!user) throw new AppError('User not found', 404);

  if (!isActive && user.role === ROLES.ADMIN) {
    if (await isOwner(id)) throw new AppError('The owner admin cannot be deactivated', 403);
    await assertNotLastAdmin(id);
  }
  user.isActive = isActive;
  if (!isActive) user.tokenVersion += 1; // kill existing sessions immediately
  await user.save();
  return user;
};

const updateRole = async (id, role, actorId) => {
  if (id === actorId) throw new AppError('You cannot change your own role', 409);
  const user = await User.findById(id);
  if (!user) throw new AppError('User not found', 404);
  if (user.role === role) return user;

  if (user.role === ROLES.ADMIN) {
    if (await isOwner(id)) throw new AppError('The owner admin cannot be demoted', 403);
    await assertNotLastAdmin(id);
  }
  if (user.role === ROLES.FLORIST) {
    const active = await Order.countDocuments({ assignedFlorist: id, status: { $in: ACTIVE_ORDER_STATUSES } });
    if (active > 0) throw new AppError('Reassign this florist\'s active orders before changing their role', 409);
  }

  user.role = role;
  user.tokenVersion += 1; // force re-login with the new role
  await user.save();

  if (role === ROLES.ADMIN) await AdminProfile.updateOne({ user: id }, { $setOnInsert: { user: id } }, { upsert: true });
  else await AdminProfile.deleteOne({ user: id });
  return user;
};

// ---------------------------------------------------------------------------
// Florists
// ---------------------------------------------------------------------------
const listFlorists = async (f, page, limit) => {
  const q = {};
  if (f.approvalStatus) q.approvalStatus = f.approvalStatus;
  if (f.search) {
    const rx = new RegExp(escapeRegex(f.search), 'i');
    const users = await User.find({ role: ROLES.FLORIST, $or: [{ name: rx }, { email: rx }] }).select('_id');
    q.user = { $in: users.map((u) => u._id) };
  }
  const [items, total] = await Promise.all([
    FloristProfile.find(q).sort({ createdAt: -1 }).skip(skipFor(page, limit)).limit(limit).populate('user', 'name email phone isActive createdAt'),
    FloristProfile.countDocuments(q),
  ]);
  return { items, pagination: paginationMeta(total, page, limit) };
};

const getFlorist = async (userId) => {
  const profile = await FloristProfile.findOne({ user: userId }).populate('user', 'name email phone isActive createdAt');
  if (!profile) throw new AppError('Florist not found', 404);
  return profile;
};

const createFlorist = async (data, adminId) => {
  const { name, email, password, phone, businessName, licenseNumber, businessAddress, bio, specialties } = data;
  let user;
  try {
    user = await User.create({ name, email, password, phone, role: ROLES.FLORIST });
  } catch (err) {
    if (err.code === 11000) throw new AppError('Email already exists', 409);
    throw err;
  }
  try {
    const profile = await FloristProfile.create({
      user: user._id,
      bio,
      specialties,
      approvalStatus: FLORIST_STATUS.APPROVED, // created by an admin => pre-approved
      verification: { businessName, licenseNumber, businessAddress, submittedAt: new Date() },
      reviewedBy: adminId,
      reviewedAt: new Date(),
    });
    return profile.populate('user', 'name email phone isActive createdAt');
  } catch (err) {
    await User.deleteOne({ _id: user._id });
    throw err;
  }
};

const updateFloristProfile = async (userId, patch) => {
  const profile = await FloristProfile.findOne({ user: userId });
  if (!profile) throw new AppError('Florist not found', 404);
  Object.assign(profile, patch);
  await profile.save();
  if (patch.isAvailable !== undefined) await User.updateOne({ _id: userId }, { isAvailable: patch.isAvailable });
  return profile;
};

const reviewFlorist = async (userId, adminId, status, reason) => {
  const profile = await FloristProfile.findOne({ user: userId });
  if (!profile) throw new AppError('Florist not found', 404);
  if (profile.approvalStatus === status) throw new AppError(`Florist is already ${status.toLowerCase()}`, 409);

  profile.approvalStatus = status;
  profile.rejectionReason = status === FLORIST_STATUS.REJECTED ? reason : undefined;
  profile.reviewedBy = adminId;
  profile.reviewedAt = new Date();
  await profile.save();

  // a rejected florist loses any active assignments' ability to act (route guard) — admin reassigns manually
  return profile.populate('user', 'name email phone isActive createdAt');
};

// ---------------------------------------------------------------------------
// Admin's own profile
// ---------------------------------------------------------------------------
const getOwnProfile = async (userId) => {
  let profile = await AdminProfile.findOne({ user: userId });
  if (!profile) profile = await AdminProfile.create({ user: userId });
  return profile;
};

const updateOwnProfile = async (userId, patch) => {
  const profile = await getOwnProfile(userId);
  const { department, ...rest } = patch;
  Object.assign(profile, rest);
  if (department && profile.isOwner) profile.department = department; // only the owner can pick any department
  await profile.save();
  return profile;
};

// ---------------------------------------------------------------------------
// Platform statistics
// ---------------------------------------------------------------------------
const getStats = async () => {
  const [orders, inventory, usersByRole, pendingFlorists, pendingProducts, openTickets, outOfStockProducts] = await Promise.all([
    orderService.getAdminStats(),
    inventoryService.countLowAndOut(),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    FloristProfile.countDocuments({ approvalStatus: FLORIST_STATUS.PENDING }),
    Product.countDocuments({ approvalStatus: 'PENDING', isActive: true }),
    SupportTicket.countDocuments({ status: { $in: ['OPEN', 'IN_PROGRESS'] } }),
    Product.countDocuments({ isActive: true, $expr: { $lte: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, 0] } }),
  ]);
  const users = { admin: 0, florist: 0, customer: 0 };
  usersByRole.forEach((u) => { users[u._id] = u.count; });

  return { orders, inventory, users, pendingFlorists, pendingProducts, openTickets, outOfStockProducts };
};

module.exports = {
  listUsers, getUser, updateUser, setActive, updateRole, listFlorists, getFlorist, createFlorist,
  updateFloristProfile, reviewFlorist, getOwnProfile, updateOwnProfile, getStats,
};
