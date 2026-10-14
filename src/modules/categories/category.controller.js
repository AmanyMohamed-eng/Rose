const service = require('./category.service');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const { logAction } = require('../admin/adminLog.service');

const listCategories = asyncHandler(async (req, res) => {
  const categories = await service.listCategories();
  sendSuccess(res, { data: { count: categories.length, categories } });
});

const listAllCategories = asyncHandler(async (req, res) => {
  const categories = await service.listAllCategories();
  sendSuccess(res, { data: { count: categories.length, categories } });
});

const getCategory = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { category: await service.getCategoryBySlug(req.params.slug) } });
});

const createCategory = asyncHandler(async (req, res) => {
  const category = await service.createCategory(req.body);
  logAction(req, 'CATEGORY_CREATED', 'CATEGORY', category._id, { after: category.toJSON() });
  sendSuccess(res, { status: 201, message: 'Category created successfully', data: { category } });
});

const updateCategory = asyncHandler(async (req, res) => {
  const before = (await service.getCategoryById(req.params.id)).toJSON();
  const category = await service.updateCategory(req.params.id, req.body);
  logAction(req, 'CATEGORY_UPDATED', 'CATEGORY', category._id, { before, after: category.toJSON() });
  sendSuccess(res, { message: 'Category updated successfully', data: { category } });
});

// Soft delete
const deleteCategory = asyncHandler(async (req, res) => {
  const category = await service.setActive(req.params.id, false);
  logAction(req, 'CATEGORY_DELETED', 'CATEGORY', category._id, { note: `Deactivated "${category.name}"` });
  sendSuccess(res, { message: 'Category deleted successfully', data: { category } });
});

const restoreCategory = asyncHandler(async (req, res) => {
  const category = await service.setActive(req.params.id, true);
  logAction(req, 'CATEGORY_UPDATED', 'CATEGORY', category._id, { note: 'Category restored' });
  sendSuccess(res, { message: 'Category restored successfully', data: { category } });
});

const toggleCategoryStatus = asyncHandler(async (req, res) => {
  const category = await service.toggleCategoryStatus(req.params.id);
  logAction(req, 'CATEGORY_UPDATED', 'CATEGORY', category._id, { after: { isActive: category.isActive } });
  sendSuccess(res, {
    message: `Category ${category.isActive ? 'activated' : 'deactivated'} successfully`,
    data: { category },
  });
});

const updateDisplayOrder = asyncHandler(async (req, res) => {
  const category = await service.updateDisplayOrder(req.params.id, req.body.displayOrder);
  logAction(req, 'CATEGORY_UPDATED', 'CATEGORY', category._id, { after: { displayOrder: category.displayOrder } });
  sendSuccess(res, { message: 'Category order updated successfully', data: { category } });
});

module.exports = {
  listCategories, listAllCategories, getCategory, createCategory, updateCategory,
  deleteCategory, restoreCategory, toggleCategoryStatus, updateDisplayOrder,
};
