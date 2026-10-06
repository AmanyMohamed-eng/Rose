const AppError = require("../../utils/AppError");

const validateCreate = (data) => {
  const { name, description, image, displayOrder } = data;

  if (!name || typeof name !== "string" || !name.trim()) {
    throw new AppError("Category name is required", 400);
  }

  if (name.trim().length < 2) {
    throw new AppError("Category name must be at least 2 characters", 400);
  }

  if (name.trim().length > 100) {
    throw new AppError("Category name must not exceed 100 characters", 400);
  }

  if (
    description !== undefined &&
    description !== null &&
    typeof description !== "string"
  ) {
    throw new AppError("Description must be a string", 400);
  }

  if (image !== undefined && image !== null && typeof image !== "string") {
    throw new AppError("Image must be a string", 400);
  }

  if (
    displayOrder !== undefined &&
    (typeof displayOrder !== "number" ||
      !Number.isInteger(displayOrder) ||
      displayOrder < 0)
  ) {
    throw new AppError("Display order must be a non-negative integer", 400);
  }
};


const validateUpdate = (data) => {
  const { name, description, image, isActive, displayOrder } = data;

  if (Object.keys(data).length === 0) {
    throw new AppError("At least one field is required for update", 400);
  }

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      throw new AppError("Category name must be a valid string", 400);
    }

    if (name.trim().length < 2) {
      throw new AppError("Category name must be at least 2 characters", 400);
    }

    if (name.trim().length > 100) {
      throw new AppError("Category name must not exceed 100 characters", 400);
    }
  }

  if (
    description !== undefined &&
    description !== null &&
    typeof description !== "string"
  ) {
    throw new AppError("Description must be a string", 400);
  }

  if (image !== undefined && image !== null && typeof image !== "string") {
    throw new AppError("Image must be a string", 400);
  }

  if (isActive !== undefined && typeof isActive !== "boolean") {
    throw new AppError("isActive must be a boolean", 400);
  }

  if (
    displayOrder !== undefined &&
    (typeof displayOrder !== "number" ||
      !Number.isInteger(displayOrder) ||
      displayOrder < 0)
  ) {
    throw new AppError("Display order must be a non-negative integer", 400);
  }
};

module.exports = {
  validateCreate,
  validateUpdate,
};
