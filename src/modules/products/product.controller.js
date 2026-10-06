const productService = require('./product.service');
const { validateCreate, validateUpdate } = require('./product.validator');

/**
 * GET /api/v1/products
 * Public — customer catalog
 */
const listProducts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 12);

    const result = await productService.listProducts(req.query, page, limit);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/products/:slug
 * Public — product detail
 */
const getProduct = async (req, res, next) => {
  try {
    const product = await productService.getProductBySlug(req.params.slug);
    res.status(200).json({ product });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/products
 * Admin only
 */
const createProduct = async (req, res, next) => {
  try {
    validateCreate(req.body);

    const product = await productService.createProduct(req.body, req.user.id);

    res.status(201).json({
      message: 'Product created successfully',
      product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/products/:id
 * Admin only
 */
const updateProduct = async (req, res, next) => {
  try {
    validateUpdate(req.body);

    const product = await productService.updateProduct(req.params.id, req.body);

    res.status(200).json({
      message: 'Product updated successfully',
      product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/products/:id
 * Admin only — soft delete
 */
const deleteProduct = async (req, res, next) => {
  try {
    await productService.softDeleteProduct(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/products/:id/featured
 * Admin only — toggle isFeatured
 */
const toggleFeatured = async (req, res, next) => {
  try {
    const product = await productService.toggleFeatured(req.params.id);
    res.status(200).json({
      message: `Product ${product.isFeatured ? 'featured' : 'unfeatured'}`,
      product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/products/:id/stock
 * Admin only — set stock quantity (restock or correction)
 * Body: { quantity: number }  (absolute set)
 */
const setStock = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    if (quantity == null || quantity < 0) {
      return next(new (require('../utils/AppError'))('Valid quantity required', 400));
    }

    const current = await productService.getProductById(req.params.id);
    const delta = quantity - current.stockQuantity;

    const product = await productService.adjustStock(req.params.id, delta);
    res.status(200).json({ message: 'Stock updated', product });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/products/admin/low-stock
 * Admin only
 */
const getLowStock = async (req, res, next) => {
  try {
    const items = await productService.getLowStockProducts();
    res.status(200).json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleFeatured,
  setStock,
  getLowStock,
};