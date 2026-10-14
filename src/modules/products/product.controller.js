const service = require('./product.service');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const { logAction } = require('../admin/adminLog.service');

// ---------- Public ----------
const listProducts = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;
  sendSuccess(res, { data: await service.listProducts(filters, page, limit) });
});

const getProduct = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { product: await service.getProductBySlug(req.params.slug) } });
});

// ---------- Admin ----------
const adminList = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;
  sendSuccess(res, { data: await service.listAdminProducts(filters, page, limit) });
});

const adminGet = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { product: await service.getProductById(req.params.id) } });
});

const createProduct = asyncHandler(async (req, res) => {
  const product = await service.createProduct(req.body, req.user);
  logAction(req, 'PRODUCT_CREATED', 'PRODUCT', product._id, { after: { title: product.title, price: product.price } });
  sendSuccess(res, { status: 201, message: 'Product created successfully', data: { product } });
});

const updateProduct = asyncHandler(async (req, res) => {
  const before = (await service.getProductById(req.params.id)).toJSON();
  const product = await service.updateProduct(req.params.id, req.body, req.user);
  logAction(req, 'PRODUCT_UPDATED', 'PRODUCT', product._id, {
    before: { title: before.title, price: before.price, isActive: before.isActive },
    after: { title: product.title, price: product.price, isActive: product.isActive },
  });
  sendSuccess(res, { message: 'Product updated successfully', data: { product } });
});

const deleteProduct = asyncHandler(async (req, res) => {
  const product = await service.softDeleteProduct(req.params.id, req.user);
  logAction(req, 'PRODUCT_DELETED', 'PRODUCT', product._id, { note: `Deactivated "${product.title}"` });
  sendSuccess(res, { message: 'Product deleted successfully' });
});

const toggleFeatured = asyncHandler(async (req, res) => {
  const product = await service.toggleFeatured(req.params.id);
  logAction(req, 'PRODUCT_FEATURED_TOGGLED', 'PRODUCT', product._id, { after: { isFeatured: product.isFeatured } });
  sendSuccess(res, { message: `Product ${product.isFeatured ? 'featured' : 'unfeatured'}`, data: { product } });
});

const setStock = asyncHandler(async (req, res) => {
  const before = (await service.getProductById(req.params.id)).stockQuantity;
  const product = await service.setStockQuantity(req.params.id, req.body.quantity);
  logAction(req, 'PRODUCT_STOCK_UPDATED', 'PRODUCT', product._id, {
    before: { stockQuantity: before },
    after: { stockQuantity: product.stockQuantity },
  });
  sendSuccess(res, { message: 'Stock updated', data: { product } });
});

const setApproval = asyncHandler(async (req, res) => {
  const product = await service.setApproval(req.params.id, req.body.status, req.body.note);
  logAction(req, product.approvalStatus === 'APPROVED' ? 'PRODUCT_APPROVED' : 'PRODUCT_REJECTED', 'PRODUCT', product._id, {
    note: req.body.note,
  });
  sendSuccess(res, { message: `Product ${product.approvalStatus.toLowerCase()}`, data: { product } });
});

const getLowStock = asyncHandler(async (req, res) => {
  const items = await service.getLowStockProducts();
  sendSuccess(res, { data: { count: items.length, items } });
});

module.exports = {
  listProducts, getProduct, adminList, adminGet, createProduct, updateProduct, deleteProduct,
  toggleFeatured, setStock, setApproval, getLowStock,
};
