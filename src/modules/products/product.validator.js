const AppError = require('../../utils/AppError');

const validateCreate = (body) => {
  const { title, description, price, category, stockQuantity } = body;

  if (!title || title.trim().length < 2) throw new AppError('Title is required (min 2 chars)', 400);
  if (!description || description.length < 10) throw new AppError('Description is required (min 10 chars)', 400);
  if (price == null || price < 0) throw new AppError('Valid price is required', 400);
  if (body.discountPrice != null && body.discountPrice > price) {
    throw new AppError('Discount price cannot exceed price', 400);
  }
  if (!category) throw new AppError('Category is required', 400);
  if (stockQuantity != null && stockQuantity < 0) throw new AppError('Stock cannot be negative', 400);
};

const validateUpdate = (body) => {
  if (body.price != null && body.price < 0) throw new AppError('Price cannot be negative', 400);
  if (body.discountPrice != null && body.price != null && body.discountPrice > body.price) {
    throw new AppError('Discount price cannot exceed price', 400);
  }
  if (body.stockQuantity != null && body.stockQuantity < 0) {
    throw new AppError('Stock cannot be negative', 400);
  }
};

module.exports = { validateCreate, validateUpdate };