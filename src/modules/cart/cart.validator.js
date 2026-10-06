const AppError = require('../../utils/AppError');

const validateAddProduct = (data) => {
  const { productId, quantity } = data;

  if (!productId) {
    throw new AppError('Product ID is required', 400);
  }

  if (
    quantity === undefined ||
    quantity === null ||
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    throw new AppError(
      'Quantity must be a positive integer',
      400
    );
  }
};

const validateUpdateQuantity = (data) => {
  const { quantity } = data;

  if (
    quantity === undefined ||
    quantity === null ||
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    throw new AppError(
      'Quantity must be a positive integer',
      400
    );
  }
};


module.exports = {
  validateAddProduct,
  validateUpdateQuantity,
};