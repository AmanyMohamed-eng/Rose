const Wishlist = require('../../models/wishlist');
const Product = require('../../models/product');
const AppError = require('../../utils/AppError');

const getOrCreate = async (customerId) => {
  let wishlist = await Wishlist.findOne({ customer: customerId });
  if (!wishlist) wishlist = await Wishlist.create({ customer: customerId, items: [] });
  return wishlist;
};

const addProduct = async (customerId, productId) => {
  const product = await Product.findById(productId);
  if (!product || !product.isActive) throw new AppError('Product not found', 404);

  const wishlist = await getOrCreate(customerId);
  if (wishlist.hasProduct(productId)) {
    throw new AppError('Product already in wishlist', 409);
  }

  wishlist.items.unshift({ product: productId });
  await wishlist.save();
  return wishlist;
};

const removeProduct = async (customerId, productId) => {
  const wishlist = await getOrCreate(customerId);
  const before = wishlist.items.length;

  wishlist.items = wishlist.items.filter(
    (i) => i.product.toString() !== productId.toString()
  );

  if (wishlist.items.length === before) {
    throw new AppError('Product not in wishlist', 404);
  }

  await wishlist.save();
  return wishlist;
};

const getWishlist = async (customerId, page = 1, limit = 20) => {
  const wishlist = await Wishlist.findOne({ customer: customerId }).populate({
    path: 'items.product',
    select: 'title slug price discountPrice images stockQuantity reservedQuantity isActive',
  });

  if (!wishlist) {
    return { items: [], pagination: { total: 0, page, limit, pages: 0 } };
  }

  // strip products that were deactivated after being wishlisted
  const valid = wishlist.items.filter((i) => i.product && i.product.isActive);
  const total = valid.length;
  const start = (page - 1) * limit;

  return {
    items: valid.slice(start, start + limit),
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  };
};

const checkWishlist = async (customerId, productId) => {
  const wishlist = await Wishlist.findOne({ customer: customerId });
  return wishlist ? wishlist.hasProduct(productId) : false;
};

const clearWishlist = async (customerId) => {
  await Wishlist.findOneAndUpdate(
    { customer: customerId },
    { $set: { items: [] } },
    { upsert: true }
  );
};

module.exports = { addProduct, removeProduct, getWishlist, checkWishlist, clearWishlist };