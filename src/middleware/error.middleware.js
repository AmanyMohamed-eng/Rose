const AppError = require('../utils/AppError');
const { config } = require('../config/env');

const notFound = (req, res, next) => next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404));

const normalise = (err) => {
  if (err instanceof AppError) return err;

  if (err.type === 'entity.parse.failed') return new AppError('Malformed JSON body', 400);
  if (err.type === 'entity.too.large') return new AppError('Request body too large', 413);

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0];
    return new AppError(field ? `A record with this ${field} already exists` : 'Duplicate value', 409);
  }
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors || {}).map((e) => ({ field: e.path, message: e.message }));
    return new AppError(errors[0]?.message || 'Validation failed', 422, errors);
  }
  if (err.name === 'CastError') return new AppError(`Invalid value for ${err.path}`, 400);
  if (err.name === 'VersionError') return new AppError('The resource was modified by someone else, please retry', 409);
  if (err.name === 'TokenExpiredError') return new AppError('Token expired', 401);
  if (err.name === 'JsonWebTokenError') return new AppError('Invalid token', 401);
  return err;
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const e = normalise(err);
  const statusCode = e.isOperational ? e.statusCode : 500;

  if (!e.isOperational) console.error('UNEXPECTED ERROR:', err);

  const body = { success: false, message: e.isOperational ? e.message : 'Internal server error' };
  if (e.isOperational && e.errors) body.errors = e.errors;
  if (config.nodeEnv === 'development' && !e.isOperational) body.stack = err.stack;

  res.status(statusCode).json(body);
};

module.exports = { notFound, errorHandler };
