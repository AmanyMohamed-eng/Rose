const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const FloristProfile = require('../../models/FloristProfile');
const AdminProfile = require('../../models/AdminProfile');
const AppError = require('../../utils/AppError');
const { signToken } = require('../../utils/jwt');
const { ROLES, FLORIST_STATUS } = require('../../constants');
const { logAction } = require('../admin/adminLog.service');

// Used to equalise response time when the e-mail does not exist.
const DUMMY_HASH = bcrypt.hashSync('rose-dummy-password', 10);

const publicUser = async (user) => {
  const out = { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role };
  if (user.role === ROLES.FLORIST) {
    const profile = await FloristProfile.findOne({ user: user._id }).select('approvalStatus rejectionReason');
    out.floristStatus = profile?.approvalStatus;
    if (profile?.approvalStatus === FLORIST_STATUS.REJECTED) out.rejectionReason = profile.rejectionReason;
  }
  return out;
};

const duplicateGuard = (err) => {
  if (err.code === 11000) throw new AppError('Email already exists', 409);
  throw err;
};

const registerCustomer = async ({ name, email, password, phone }) => {
  try {
    // role is ALWAYS customer here — never taken from the request.
    const user = await User.create({ name, email, password, phone, role: ROLES.CUSTOMER });
    return publicUser(user);
  } catch (err) {
    return duplicateGuard(err);
  }
};

const registerFlorist = async (data) => {
  const { name, email, password, phone, businessName, licenseNumber, nationalId, businessAddress, documents } = data;
  let user;
  try {
    user = await User.create({ name, email, password, phone, role: ROLES.FLORIST });
  } catch (err) {
    return duplicateGuard(err);
  }
  try {
    await FloristProfile.create({
      user: user._id,
      approvalStatus: FLORIST_STATUS.PENDING, // never auto-approved
      verification: { businessName, licenseNumber, nationalId, businessAddress, documents, submittedAt: new Date() },
    });
  } catch (err) {
    await User.deleteOne({ _id: user._id });
    throw err;
  }
  return publicUser(user);
};

const login = async (email, password, req) => {
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw new AppError('Invalid Email or Password', 401);
  }

  const ok = await user.comparePassword(password);
  if (!ok) {
    if (user.role === ROLES.ADMIN) logAction(req, 'ADMIN_LOGIN_FAILED', 'SYSTEM', user._id, { actorId: user.id });
    throw new AppError('Invalid Email or Password', 401);
  }
  if (!user.isActive) throw new AppError('Your account has been deactivated', 403);

  user.lastLoginAt = new Date();
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: user.lastLoginAt } });

  if (user.role === ROLES.ADMIN) {
    await AdminProfile.updateOne({ user: user._id }, { $set: { lastLoginAt: user.lastLoginAt } });
    logAction(req, 'ADMIN_LOGIN', 'SYSTEM', user._id, { actorId: user.id });
  }

  return { token: signToken(user), user: await publicUser(user) };
};

const logout = async (userId, role, req) => {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  if (role === ROLES.ADMIN) logAction(req, 'ADMIN_LOGOUT', 'SYSTEM', userId);
};

const getMe = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  return publicUser(user);
};

const updateMe = async (userId, patch) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  if (patch.name !== undefined) user.name = patch.name;
  if (patch.phone !== undefined) user.phone = patch.phone;
  await user.save();
  return publicUser(user);
};

const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId).select('+password');
  if (!user) throw new AppError('User not found', 404);
  if (!(await user.comparePassword(currentPassword))) throw new AppError('Current password is incorrect', 401);
  if (currentPassword === newPassword) throw new AppError('New password must be different', 422);

  user.password = newPassword; // hashed by the pre-save hook
  user.tokenVersion += 1; // invalidates every previously issued token
  await user.save();
  return { token: signToken(user) };
};

module.exports = { registerCustomer, registerFlorist, login, logout, getMe, updateMe, changePassword };
