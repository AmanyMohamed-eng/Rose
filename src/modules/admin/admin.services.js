const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../../models/user');
const FloristProfile = require('../../models/florist');
const AppError = require('../../utils/AppError');

const ROLES = ['admin', 'florist', 'customer'];

const assertObjectId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid user ID', 400);
};

const listUsers = async (filters = {}, page = 1, limit = 20) => {
  const query = {};
  if (filters.role && ROLES.includes(filters.role)) query.role = filters.role;
  if (filters.isActive === 'true') query.isActive = true;
  if (filters.isActive === 'false') query.isActive = false;
  if (filters.search) {
    const escaped = String(filters.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { name: new RegExp(escaped, 'i') },
      { email: new RegExp(escaped, 'i') },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(query),
  ]);

  return { items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
};

const getUser = async (id) => {
  assertObjectId(id);
  const user = await User.findById(id);
  if (!user) throw new AppError('User not found', 404);
  return { user };
};

const updateUserRole = async (id, role, actorId) => {
  assertObjectId(id);
  if (!ROLES.includes(role)) throw new AppError('Invalid role', 400);
  if (String(id) === String(actorId)) {
    throw new AppError('You cannot change your own role', 400);
  }

  const user = await User.findByIdAndUpdate(id, { role }, { new: true, runValidators: true });
  if (!user) throw new AppError('User not found', 404);
  return user;
};

const setUserActive = async (id, isActive, actorId) => {
  assertObjectId(id);
  if (!isActive && String(id) === String(actorId)) {
    throw new AppError('You cannot deactivate your own account', 400);
  }

  const user = await User.findByIdAndUpdate(id, { isActive }, { new: true });
  if (!user) throw new AppError('User not found', 404);
  return user;
};

const createFlorist = async ({ name, email, password, phone, bio, specialties }) => {
  const hashed = await bcrypt.hash(password, 12);
  const user = await User.create({
    name,
    email,
    password: hashed,
    phone,
    role: 'florist',
  });

  try {
    await FloristProfile.create({ user: user._id, bio, specialties });
  } catch (err) {
    await User.deleteOne({ _id: user._id }); // keep user + profile consistent
    throw err;
  }

  return user;
};

module.exports = {
  listUsers,
  getUser,
  updateUserRole,
  setUserActive,
  createFlorist,
};
