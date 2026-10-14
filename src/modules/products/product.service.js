const Product = require('../../models/Product');
const Category = require('../../models/Category');
const InventoryItem = require('../../models/InventoryItem');
const User = require('../../models/User');
const FloristProfile = require('../../models/FloristProfile');
const AppError = require('../../utils/AppError');
const { uniqueSlug } = require('../../utils/slug');
const { paginationMeta, skipFor } = require('../../utils/pagination');
const { ROLES, FLORIST_STATUS } = require('../../constants');

const VISIBLE = { isActive: true, approvalStatus: { $nin: ['PENDING', 'REJECTED'] } };

// ---------------------------------------------------------------------------
// Serialisation — customers must never learn who owns a product (florist isolation)
// nor see internal inventory data.
// ---------------------------------------------------------------------------
const toPublic = (doc) => {
  const o = doc.toJSON();
  for (const k of ['florist', 'createdBy', 'reservedQuantity', 'recipe', 'approvalStatus', 'approvalNote', 'lowStockThreshold']) {
    delete o[k];
  }
  return o;
};

// ---------------------------------------------------------------------------
// Public catalogue
// ---------------------------------------------------------------------------
const buildQuery = (f) => {
  const query = { ...VISIBLE };
  if (f.category) query.category = f.category;
  if (f.featured) query.isFeatured = true;
  if (f.minPrice !== undefined || f.maxPrice !== undefined) {
    query.price = {};
    if (f.minPrice !== undefined) query.price.$gte = f.minPrice;
    if (f.maxPrice !== undefined) query.price.$lte = f.maxPrice;
  }
  if (f.inStock) query.$expr = { $gt: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, 0] };
  if (f.tag) query.tags = f.tag.toLowerCase();
  if (f.occasion) query.occasions = f.occasion;
  if (f.search) query.$text = { $search: f.search };
  return query;
};

const buildSort = (sort) => {
  switch (sort) {
    case 'price_asc': return { price: 1 };
    case 'price_desc': return { price: -1 };
    case 'popular': return { soldCount: -1 };
    case 'rating': return { ratingsAverage: -1 };
    default: return { createdAt: -1 };
  }
};

const listProducts = async (filters, page, limit) => {
  const query = buildQuery(filters);
  const [items, total] = await Promise.all([
    Product.find(query).sort(buildSort(filters.sort)).skip(skipFor(page, limit)).limit(limit).populate('category', 'name slug'),
    Product.countDocuments(query),
  ]);
  return { items: items.map(toPublic), pagination: paginationMeta(total, page, limit) };
};

const getProductBySlug = async (slug) => {
  const product = await Product.findOne({ slug, ...VISIBLE }).populate('category', 'name slug');
  if (!product) throw new AppError('Product not found', 404);
  return toPublic(product);
};

// ---------------------------------------------------------------------------
// Admin / owner reads
// ---------------------------------------------------------------------------
const getProductById = async (id) => {
  const product = await Product.findById(id).populate('category', 'name slug');
  if (!product) throw new AppError('Product not found', 404);
  return product;
};

const adminFilter = (f) => {
  const q = {};
  if (f.category) q.category = f.category;
  if (f.florist) q.florist = f.florist;
  if (f.approvalStatus) q.approvalStatus = f.approvalStatus;
  if (f.isActive !== undefined) q.isActive = f.isActive;
  if (f.search) q.$text = { $search: f.search };
  return q;
};

const listAdminProducts = async (filters, page, limit) => {
  const q = adminFilter(filters);
  const [items, total] = await Promise.all([
    Product.find(q).sort({ createdAt: -1 }).skip(skipFor(page, limit)).limit(limit).populate('category', 'name slug').populate('florist', 'name'),
    Product.countDocuments(q),
  ]);
  return { items, pagination: paginationMeta(total, page, limit) };
};

const listFloristProducts = async (floristId, filters, page, limit) => {
  const q = { florist: floristId };
  if (filters.category) q.category = filters.category;
  if (filters.search) q.$text = { $search: filters.search };
  const [items, total] = await Promise.all([
    Product.find(q)
      .sort({ createdAt: -1 })
      .skip(skipFor(page, limit))
      .limit(limit)
      .select('-createdBy')
      .populate('category', 'name slug'),
    Product.countDocuments(q),
  ]);
  return { items, pagination: paginationMeta(total, page, limit) };
};

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------
const assertApprovedFlorist = async (userId) => {
  const user = await User.findOne({ _id: userId, role: ROLES.FLORIST, isActive: true }).select('_id');
  const profile = user && (await FloristProfile.findOne({ user: userId }).select('approvalStatus'));
  if (!profile || profile.approvalStatus !== FLORIST_STATUS.APPROVED) {
    throw new AppError('Florist not found or not approved', 400);
  }
};

const assertCategory = async (categoryId) => {
  if (!(await Category.exists({ _id: categoryId, isActive: true }))) throw new AppError('Category not found', 404);
};

/** Resolves recipe lines against real inventory items; name/unit come from the DB, never the client. */
const buildRecipe = async (lines = []) => {
  if (!lines.length) return [];
  const ids = [...new Set(lines.map((l) => l.inventoryItem))];
  if (ids.length !== lines.length) throw new AppError('Duplicate inventory items in recipe', 422);
  const items = await InventoryItem.find({ _id: { $in: ids }, isActive: true });
  const map = new Map(items.map((i) => [i.id, i]));
  return lines.map((l) => {
    const item = map.get(l.inventoryItem);
    if (!item) throw new AppError(`Inventory item ${l.inventoryItem} not found`, 404);
    return { inventoryItem: item._id, name: item.name, unit: item.unit, quantity: l.quantity };
  });
};

/** actor: { id, role } — a florist can only create products for themselves, and they start as PENDING. */
const createProduct = async (data, actor) => {
  await assertCategory(data.category);
  const recipe = await buildRecipe(data.recipe);

  let florist = null;
  let approvalStatus = 'APPROVED';
  if (actor.role === ROLES.FLORIST) {
    florist = actor.id;
    approvalStatus = 'PENDING';
  } else if (data.florist) {
    await assertApprovedFlorist(data.florist);
    florist = data.florist;
  }

  const { florist: _ignored, ...rest } = data;
  const slug = await uniqueSlug(Product, data.title, 'product');
  return Product.create({ ...rest, recipe, slug, florist, approvalStatus, createdBy: actor.id });
};

const PRICE_FIELDS = ['price', 'discountPrice', 'sizes'];
const COMMON_FIELDS = [
  'title', 'shortDescription', 'description', 'careInstructions', 'category', 'tags', 'occasions',
  'images', 'lowStockThreshold', 'price', 'discountPrice', 'sizes',
];

const updateProduct = async (id, data, actor) => {
  const filter = actor.role === ROLES.FLORIST ? { _id: id, florist: actor.id } : { _id: id };
  const product = await Product.findOne(filter);
  if (!product) throw new AppError('Product not found', 404);

  if (actor.role === ROLES.FLORIST) {
    const touchesPrice = PRICE_FIELDS.some((k) => data[k] !== undefined);
    if (touchesPrice && product.approvalStatus === 'APPROVED') {
      throw new AppError('Pricing of an approved product can only be changed by an admin', 403);
    }
  }

  if (data.category !== undefined) await assertCategory(data.category);
  if (data.recipe !== undefined) product.recipe = await buildRecipe(data.recipe);

  for (const key of COMMON_FIELDS) if (data[key] !== undefined) product[key] = data[key];

  if (actor.role === ROLES.ADMIN) {
    if (data.isFeatured !== undefined) product.isFeatured = data.isFeatured;
    if (data.isActive !== undefined) product.isActive = data.isActive;
    if (data.florist !== undefined) {
      if (data.florist) await assertApprovedFlorist(data.florist);
      product.florist = data.florist;
    }
  }
  await product.save(); // runs the model's price / reserved-quantity guards
  return product;
};

const softDeleteProduct = async (id, actor) => {
  const filter = actor.role === ROLES.FLORIST ? { _id: id, florist: actor.id } : { _id: id };
  const product = await Product.findOneAndUpdate(filter, { isActive: false }, { new: true });
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

const setApproval = async (id, status, note) => {
  const product = await Product.findById(id);
  if (!product) throw new AppError('Product not found', 404);
  product.approvalStatus = status;
  product.approvalNote = status === 'REJECTED' ? note : undefined;
  await product.save();
  return product;
};

// ---------------------------------------------------------------------------
// Stock — all atomic; stock can never go negative or below the reserved amount
// ---------------------------------------------------------------------------
/** Absolute stock set (admin, or the owning florist when floristId is given). */
const setStockQuantity = async (id, quantity, floristId = null) => {
  const filter = { _id: id, reservedQuantity: { $lte: quantity } };
  if (floristId) filter.florist = floristId;
  const product = await Product.findOneAndUpdate(filter, { $set: { stockQuantity: quantity } }, { new: true });
  if (product) return product;

  const exists = await Product.findOne(floristId ? { _id: id, florist: floristId } : { _id: id }).select('_id');
  if (!exists) throw new AppError('Product not found', 404);
  throw new AppError('Quantity cannot be below the reserved amount', 409);
};

const reserveStock = async (id, qty) => {
  const res = await Product.findOneAndUpdate(
    {
      _id: id,
      isActive: true,
      approvalStatus: { $nin: ['PENDING', 'REJECTED'] },
      $expr: { $gte: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, qty] },
    },
    { $inc: { reservedQuantity: qty } },
    { new: true }
  );
  if (!res) {
    const p = await Product.findById(id).select('title');
    throw new AppError(`Insufficient stock${p ? ` for "${p.title}"` : ''}`, 409);
  }
  return res;
};

/** Release a reservation (clamped at 0). */
const releaseReservation = (id, qty) =>
  Product.updateOne({ _id: id }, [{ $set: { reservedQuantity: { $max: [0, { $subtract: ['$reservedQuantity', qty] }] } } }]);

const restoreReservation = (id, qty) => Product.updateOne({ _id: id }, { $inc: { reservedQuantity: qty } });

/** Reservation -> actual deduction (order confirmed). */
const commitSale = async (id, qty) => {
  const res = await Product.updateOne(
    { _id: id, stockQuantity: { $gte: qty }, reservedQuantity: { $gte: qty } },
    { $inc: { stockQuantity: -qty, reservedQuantity: -qty, soldCount: qty } }
  );
  if (res.matchedCount === 0) throw new AppError('Stock commit failed — inventory mismatch', 409);
};

const revertCommit = (id, qty) =>
  Product.updateOne({ _id: id }, { $inc: { stockQuantity: qty, reservedQuantity: qty, soldCount: -qty } });

/** Cancelled after confirmation: put the units back on the shelf. */
const reverseSale = (id, qty) =>
  Product.updateOne({ _id: id }, [
    {
      $set: {
        stockQuantity: { $add: ['$stockQuantity', qty] },
        soldCount: { $max: [0, { $subtract: ['$soldCount', qty] }] },
      },
    },
  ]);

const recommitSale = (id, qty) =>
  Product.updateOne({ _id: id, stockQuantity: { $gte: qty } }, { $inc: { stockQuantity: -qty, soldCount: qty } });

const lowStockFilter = {
  isActive: true,
  $expr: {
    $and: [
      { $gt: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, 0] },
      { $lte: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, '$lowStockThreshold'] },
    ],
  },
};

const getLowStockProducts = () =>
  Product.find(lowStockFilter).select('title slug stockQuantity reservedQuantity lowStockThreshold florist');

const countLowStock = () => Product.countDocuments(lowStockFilter);

module.exports = {
  toPublic, listProducts, getProductBySlug, getProductById, listAdminProducts, listFloristProducts,
  createProduct, updateProduct, softDeleteProduct, toggleFeatured, setApproval, setStockQuantity,
  reserveStock, releaseReservation, restoreReservation, commitSale, revertCommit, reverseSale, recommitSale,
  getLowStockProducts, countLowStock,
};
