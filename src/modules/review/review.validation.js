const AppError = require('../../utils/AppError');

const validateCreateReview = (body) => {
  const { productId, orderId, rating, comment } = body;

  if (!productId || !/^[0-9a-fA-F]{24}$/.test(productId)) {
    throw new AppError('Valid productId is required', 400);
  }
  if (!orderId || !/^[0-9a-fA-F]{24}$/.test(orderId)) {
    throw new AppError('Valid orderId is required', 400);
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new AppError('Rating must be an integer between 1 and 5', 400);
  }
  if (!comment || comment.trim().length < 3) {
    throw new AppError('Comment must be at least 3 characters', 400);
  }
  if (comment.length > 1000) {
    throw new AppError('Comment too long (max 1000)', 400);
  }
  if (body.title && body.title.length > 120) {
    throw new AppError('Title too long (max 120)', 400);
  }
};

const validateUpdateReview = (body) => {
  if (body.rating != null) {
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
      throw new AppError('Rating must be an integer between 1 and 5', 400);
    }
  }
  if (body.comment != null) {
    if (typeof body.comment !== 'string' || body.comment.trim().length < 3) {
      throw new AppError('Comment must be at least 3 characters', 400);
    }
    if (body.comment.length > 1000) {
      throw new AppError('Comment too long (max 1000)', 400);
    }
  }
  if (body.title != null && body.title.length > 120) {
    throw new AppError('Title too long (max 120)', 400);
  }
};

const validateModeration = (body) => {
  const allowed = ['APPROVED', 'REJECTED'];
  if (!body.status || !allowed.includes(body.status)) {
    throw new AppError('Status must be APPROVED or REJECTED', 400);
  }
  if (body.note && body.note.length > 300) {
    throw new AppError('Note too long (max 300)', 400);
  }
};

module.exports = {
  validateCreateReview,
  validateUpdateReview,
  validateModeration,
};