const jwt = require('jsonwebtoken');
const { config } = require('../config/env');

const signToken = (user) =>
  jwt.sign({ id: String(user._id || user.id), role: user.role, tv: user.tokenVersion || 0 }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
  });

const verifyToken = (token) => jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });

module.exports = { signToken, verifyToken };
