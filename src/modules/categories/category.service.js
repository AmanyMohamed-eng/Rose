const Category = require('../../models/Category');
const AppError = require('../../utils/AppError');
const { uniqueSlug } = require('../../utils/slug');

const listCategories = () => Category.find({ isActive: true }).sort({ displayOrder: 1, name: 1 });
const listAllCategories = () => Category.find().sort({ displayOrder: 1, name: 1 });

const getCategoryBySlug = async (slug) => {
  const category = await Category.findOne({ slug, isActive: true });
  if (!category) throw new AppError('Category not found', 404);
  return category;
};

const getCategoryById = async (id) => {
  const category = await Category.findById(id);
  if (!category) throw new AppError('Category not found', 404);
  return category;
};

const createCategory = async ({ name, description, image, displayOrder }) => {
  const lowered = name.toLowerCase();
  if (await Category.exists({ name: lowered })) throw new AppError('Category already exists', 409);
  const slug = await uniqueSlug(Category, name, 'category');
  return Category.create({ name, slug, description, image, displayOrder });
};

const updateCategory = async (id, data) => {
  const category = await getCategoryById(id);
  if (data.name !== undefined && data.name.toLowerCase() !== category.name) {
    if (await Category.exists({ name: data.name.toLowerCase(), _id: { $ne: id } })) {
      throw new AppError('Category already exists', 409);
    }
  }
  for (const key of ['name', 'description', 'image', 'displayOrder', 'isActive']) {
    if (data[key] !== undefined) category[key] = data[key];
  }
  await category.save();
  return category;
};

const setActive = async (id, isActive) => {
  const category = await getCategoryById(id);
  category.isActive = isActive;
  await category.save();
  return category;
};

const toggleCategoryStatus = async (id) => {
  const category = await getCategoryById(id);
  category.isActive = !category.isActive;
  await category.save();
  return category;
};

const updateDisplayOrder = async (id, displayOrder) => {
  const category = await getCategoryById(id);
  category.displayOrder = displayOrder;
  await category.save();
  return category;
};

module.exports = {
  listCategories, listAllCategories, getCategoryBySlug, getCategoryById, createCategory,
  updateCategory, setActive, toggleCategoryStatus, updateDisplayOrder,
};
