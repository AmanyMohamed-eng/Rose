const Product = require('../../models/product');
const Category = require('../../models/category');
const AppError = require('../../utils/AppError');

const buildQuery = (filters = {}) => {
  const query = { isActive: true };

  if (filters.category) query.category = filters.category;
  if (filters.featured === 'true') query.isFeatured = true;
  if (filters.minPrice || filters.maxPrice) {
    query.price = {};
    if (filters.minPrice) query.price.$gte = Number(filters.minPrice);
    if (filters.maxPrice) query.price.$lte = Number(filters.maxPrice);
  }
  if (filters.inStock === 'true') {
    query.$expr = { $gt: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, 0] };
  }
  if (filters.tag) query.tags = filters.tag;
  if (filters.occasion) query.occasions = filters.occasion;
  if (filters.search) query.$text = { $search: filters.search };

  return query;
};

const buildSort = (sort) => {
  switch (sort) {
    case 'price_asc': return { price: 1 };
    case 'price_desc': return { price: -1 };
    case 'newest': return { createdAt: -1 };
    case 'popular': return { soldCount: -1 };
    case 'rating': return { ratingsAverage: -1 };
    default: return { createdAt: -1 };
  }
};

const listProducts = async (filters = {}, page = 1, limit = 12) => {
  const query = buildQuery(filters);
  const sort = buildSort(filters.sort);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Product.find(query).sort(sort).skip(skip).limit(limit).populate('category', 'name slug'),
    Product.countDocuments(query),
  ]);

  return {
    items,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
};

const getProductBySlug = async (slug) => {
  const product = await Product.findOne({ slug, isActive: true }).populate('category', 'name slug');
  if (!product) throw new AppError('Product not found', 404);
  return product;
};

const getProductById = async (id) => {
  const product = await Product.findById(id).populate('category', 'name slug');
  if (!product) throw new AppError('Product not found', 404);
  return product;
};

const createProduct = async (data, userId) => {
  const category = await Category.findById(data.category);
  if (!category) throw new AppError('Category not found', 404);

  const product = await Product.create({ ...data, createdBy: userId });
  return product;
};

const updateProduct = async (id, data) => {
  delete data.stockQuantity;
  delete data.reservedQuantity;
  delete data.soldCount;
  delete data.ratingsAverage;
  delete data.ratingsCount;
  delete data.slug;

  const product = await Product.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!product) throw new AppError('Product not found', 404);
  return product;
};

const softDeleteProduct = async (id) => {
  const product = await Product.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!product) throw new AppError('Product not found', 404);
  return product;
};

const toggleFeatured = async (id) => {
  const product = await Product.findById(id);
  if (!product) throw new AppError('Product not found', 404);
  product.isFeatured = !product.isFeatured;
  await product.save();
  return product;
};

/**
 * Adjust stock — used by admin restock and by the order service.
 * Positive delta = restock, negative delta = depletion.
 */
const adjustStock = async (id, delta) => {
  const product = await Product.findById(id);
  if (!product) throw new AppError('Product not found', 404);

  const next = product.stockQuantity + delta;
  if (next < product.reservedQuantity) {
    throw new AppError('Cannot reduce stock below reserved quantity', 409);
  }
  product.stockQuantity = next;
  await product.save();
  return product;
};

/**
 * Reserve stock during checkout (does NOT deduct yet).
 */
const reserveStock = async (id, qty) => {
  const product = await Product.findById(id);
  if (!product) throw new AppError('Product not found', 404);
  if (!product.canFulfill(qty)) throw new AppError('Insufficient stock', 409);

  product.reservedQuantity += qty;
  await product.save();
  return product;
};

/**
 * Release reservation (checkout abandoned / cancelled).
 */
const releaseReservation = async (id, qty) => {
  const product = await Product.findById(id);
  if (!product) throw new AppError('Product not found', 404);

  product.reservedQuantity = Math.max(0, product.reservedQuantity - qty);
  await product.save();
  return product;
};

/**
 * Commit reservation → actual deduction (order confirmed).
 */
const commitSale = async (id, qty) => {
  const product = await Product.findById(id);
  if (!product) throw new AppError('Product not found', 404);
  if (product.stockQuantity < qty) throw new AppError('Insufficient stock', 409);

  product.stockQuantity -= qty;
  product.reservedQuantity = Math.max(0, product.reservedQuantity - qty);
  product.soldCount += qty;
  await product.save();
  return product;
};

const getLowStockProducts = async () => {
  return Product.find({
    isActive: true,
    $expr: {
      $and: [
        { $gt: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, 0] },
        { $lte: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, '$lowStockThreshold'] },
      ],
    },
  }).select('title slug stockQuantity reservedQuantity lowStockThreshold');
};

module.exports = {
  listProducts,
  getProductBySlug,
  getProductById,
  createProduct,
  updateProduct,
  softDeleteProduct,
  toggleFeatured,
  adjustStock,
  reserveStock,
  releaseReservation,
  commitSale,
  getLowStockProducts,
};