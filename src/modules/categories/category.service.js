const Category = require('../../models/category');
const AppError = require('../../utils/AppError');


const listCategories = async () => {
  return Category.find({ isActive: true })
    .sort({ displayOrder: 1, name: 1 });
};

const getCategoryBySlug = async (slug) => {
  const category = await Category.findOne({
    slug,
    isActive: true,
  });

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  return category;
};

const getCategoryById = async (id) => {
  const category = await Category.findById(id);

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  return category;
};

const createCategory = async (data) => {
  const {
    name,
    description,
    image,
    displayOrder,
  } = data;

  const existingCategory = await Category.findOne({ name });

  if (existingCategory) {
    throw new AppError('Category already exists', 409);
  }

  const category = await Category.create({
    name,
    description,
    image,
    displayOrder,
  });

  return category;
};

const updateCategory = async (id, data) => {
  const category = await Category.findById(id);

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  const {
    name,
    description,
    image,
    displayOrder,
  } = data;

  if (name !== undefined) {
    category.name = name;
  }

  if (description !== undefined) {
    category.description = description;
  }

  if (image !== undefined) {
    category.image = image;
  }

  if (displayOrder !== undefined) {
    category.displayOrder = displayOrder;
  }

  await category.save();

  return category;
};

const softDeleteCategory = async (id) => {
  const category = await Category.findById(id);

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  category.isActive = false;

  await category.save();

  return category;
};

const restoreCategory = async (id) => {
  const category = await Category.findById(id);

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  category.isActive = true;

  await category.save();

  return category;
};

const toggleCategoryStatus = async (id) => {
  const category = await Category.findById(id);

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  category.isActive = !category.isActive;

  await category.save();

  return category;
};

const updateDisplayOrder = async (id, displayOrder) => {
  const category = await Category.findById(id);

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  category.displayOrder = displayOrder;

  await category.save();

  return category;
};


module.exports = {
  listCategories,
  getCategoryBySlug,
  getCategoryById,
  createCategory,
  updateCategory,
  softDeleteCategory,
  restoreCategory,
  toggleCategoryStatus,
  updateDisplayOrder,
};