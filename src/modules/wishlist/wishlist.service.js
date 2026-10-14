const Wishlist = require('../../models/Wishlist');
const Product = require('../../models/Product');
const AppError = require('../../utils/AppError');
const { paginationMeta, skipFor } = require('../../utils/pagination');

const addProduct = async (customerId, productId) => {
  const product = await Product.findOne({
    _id: productId,
    isActive: true,
    approvalStatus: { $nin: ['PENDING', 'REJECTED'] },
  }).select('_id');
  if (!product) throw new AppError('Product not found', 404);

  try {
    // Atomic duplicate guard: the filter only matches when the product is NOT already listed.
    // If the customer's wishlist exists but already holds the product, the upsert tries to insert a
    // second document for the same customer and the unique index rejects it (E11000).
    await Wishlist.updateOne(
      { customer: customerId, 'items.product': { $ne: productId } },
      { $push: { items: { $each: [{ product: productId, addedAt: new Date() }], $position: 0 } } },
      { upsert: true }
    );
  } catch (err) {
    if (err.code === 11000) throw new AppError('Product already in wishlist', 409);
    throw err;
  }
  return Wishlist.findOne({ customer: customerId });
};

const removeProduct = async (customerId, productId) => {
  const res = await Wishlist.updateOne(
    { customer: customerId, 'items.product': productId },
    { $pull: { items: { product: productId } } }
  );
  if (res.matchedCount === 0) throw new AppError('Product not in wishlist', 404);
  return Wishlist.findOne({ customer: customerId });
};

const getWishlist = async (customerId, page, limit) => {
  const wishlist = await Wishlist.findOne({ customer: customerId }).populate({
    path: 'items.product',
    select: 'title slug price discountPrice images stockQuantity reservedQuantity isActive approvalStatus',
  });
  if (!wishlist) return { items: [], pagination: paginationMeta(0, page, limit) };

  // hide products that were deactivated / un-approved after being wishlisted
  const valid = wishlist.items.filter(
    (i) => i.product && i.product.isActive && !['PENDING', 'REJECTED'].includes(i.product.approvalStatus)
  );
  const start = skipFor(page, limit);
  return { items: valid.slice(start, start + limit), pagination: paginationMeta(valid.length, page, limit) };
};

const checkWishlist = async (customerId, productId) =>
  !!(await Wishlist.exists({ customer: customerId, 'items.product': productId }));

const clearWishlist = async (customerId) => {
  await Wishlist.updateOne({ customer: customerId }, { $set: { items: [] } });
};

module.exports = { addProduct, removeProduct, getWishlist, checkWishlist, clearWishlist };
