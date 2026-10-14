const AppError = require('../utils/AppError');
const FloristProfile = require('../models/FloristProfile');
const asyncHandler = require('../utils/asyncHandler');
const { ROLES, FLORIST_STATUS } = require('../constants');

/** allowRoles('admin', 'customer') — must run after authenticate. */
const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user) return next(new AppError('Authentication required', 401));
  if (!roles.includes(req.user.role)) {
    return next(new AppError('You do not have permission to perform this action', 403));
  }
  return next();
};

/** Florist functionality is only available once an Admin has approved the florist. */
const requireApprovedFlorist = asyncHandler(async (req, res, next) => {
  if (!req.user) throw new AppError('Authentication required', 401);
  if (req.user.role !== ROLES.FLORIST) throw new AppError('You do not have permission to perform this action', 403);

  const profile = await FloristProfile.findOne({ user: req.user.id }).select('approvalStatus');
  if (!profile) throw new AppError('Florist profile not found', 403);
  if (profile.approvalStatus === FLORIST_STATUS.PENDING) {
    throw new AppError('Your florist account is awaiting admin approval', 403);
  }
  if (profile.approvalStatus === FLORIST_STATUS.REJECTED) {
    throw new AppError('Your florist application was rejected', 403);
  }
  next();
});

module.exports = { allowRoles, requireApprovedFlorist };
