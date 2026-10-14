const service = require('./florist.service');
const productService = require('../products/product.service');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');

const getProfile = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { profile: await service.getProfile(req.user.id) } });
});

const updateVerification = asyncHandler(async (req, res) => {
  const profile = await service.updateVerification(req.user.id, req.body);
  sendSuccess(res, { message: 'Verification details submitted for admin review', data: { profile } });
});

const updateProfile = asyncHandler(async (req, res) => {
  const profile = await service.updateProfile(req.user.id, req.body);
  sendSuccess(res, { message: 'Profile updated', data: { profile } });
});

const toggleAvailability = asyncHandler(async (req, res) => {
  const profile = await service.toggleAvailability(req.user.id);
  sendSuccess(res, { message: `Availability set to ${profile.isAvailable ? 'available' : 'unavailable'}`, data: { profile } });
});

const getDashboard = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await service.getDashboard(req.user.id) });
});

// ---- products (own only; ownership is enforced inside the services) ----
const listProducts = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;
  sendSuccess(res, { data: await service.listProducts(req.user.id, filters, page, limit) });
});

const getProduct = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { product: await service.getOwnProduct(req.user.id, req.params.productId) } });
});

const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body, req.user);
  sendSuccess(res, {
    status: 201,
    message: 'Product submitted. It will be visible to customers once an admin approves it.',
    data: { product },
  });
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.productId, req.body, req.user);
  sendSuccess(res, { message: 'Product updated', data: { product } });
});

const deleteProduct = asyncHandler(async (req, res) => {
  await productService.softDeleteProduct(req.params.productId, req.user);
  sendSuccess(res, { message: 'Product deactivated' });
});

const updateProductStock = asyncHandler(async (req, res) => {
  const product = await productService.setStockQuantity(req.params.productId, req.body.quantity, req.user.id);
  sendSuccess(res, { message: 'Stock updated', data: { product } });
});

const listInventory = asyncHandler(async (req, res) => {
  const items = await service.listInventory(req.user.id);
  sendSuccess(res, { data: { count: items.length, items } });
});

const getMyOrders = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;
  sendSuccess(res, { data: await service.getMyOrders(req.user.id, filters, page, limit) });
});

module.exports = {
  getProfile, updateVerification, updateProfile, toggleAvailability, getDashboard, listProducts, getProduct,
  createProduct, updateProduct, deleteProduct, updateProductStock, listInventory, getMyOrders,
};
