const mongoose = require('mongoose');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../utils/jwt');

/**
 * Verifies the Bearer token AND re-checks the user in the database, so that
 * blocked users, logged-out sessions (tokenVersion) and role changes take effect immediately.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401);
  }
  const token = header.slice(7).trim();
  if (!token) throw new AppError('Authentication required', 401);

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    throw new AppError(err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token', 401);
  }
  if (!mongoose.isValidObjectId(payload.id)) throw new AppError('Invalid token', 401);

  const user = await User.findById(payload.id).select('name email role isActive tokenVersion');
  if (!user) throw new AppError('Invalid token', 401);
  if (!user.isActive) throw new AppError('Your account has been deactivated', 403);
  if ((payload.tv || 0) !== user.tokenVersion) throw new AppError('Session expired, please log in again', 401);

  req.user = { id: user.id, role: user.role, name: user.name, email: user.email };
  next();
});

module.exports = authenticate;
