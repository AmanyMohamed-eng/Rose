const mongoose = require('mongoose');
const Review = require('../../models/Review');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const AppError = require('../../utils/AppError');
const { paginationMeta, skipFor } = require('../../utils/pagination');

const oid = (id) => new mongoose.Types.ObjectId(String(id));

const recalcProductRating = async (productId) => {
  const pid = oid(productId); // aggregate() does NOT auto-cast strings to ObjectId
  const [stats] = await Review.aggregate([
    { $match: { product: pid, status: 'APPROVED' } },
    { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const avg = stats ? Math.round(stats.avg * 10) / 10 : 0;
  await Product.updateOne({ _id: pid }, { $set: { ratingsAverage: avg, ratingsCount: stats ? stats.count : 0 } });
};

const addReview = async (customerId, { productId, orderId, rating, comment, title }) => {
  const product = await Product.findById(productId).select('isActive');
  if (!product || !product.isActive) throw new AppError('Product not found', 404);

  const order = await Order.findById(orderId);
  if (!order || order.customer.toString() !== customerId) {
    // same message for "missing" and "someone else's" so order ids cannot be probed
    throw new AppError('Order not found', 404);
  }
  if (order.status !== 'DELIVERED') throw new AppError('You can only review delivered orders', 400);
  if (!order.items.some((i) => i.product.toString() === productId)) {
    throw new AppError('This product is not part of that order', 400);
  }

  let review;
  try {
    review = await Review.create({ product: productId, customer: customerId, order: orderId, rating, title, comment, status: 'APPROVED' });
  } catch (err) {
    if (err.code === 11000) throw new AppError('You have already reviewed this product', 409);
    throw err;
  }

  if (!order.isReviewed) await Order.updateOne({ _id: order._id }, { $set: { isReviewed: true } });
  await recalcProductRating(productId);
  return review;
};

// Public lists show only the reviewer's first name.
const firstName = (review) => {
  const o = review.toJSON();
  if (o.customer && o.customer.name) o.customer = { name: String(o.customer.name).split(' ')[0] };
  return o;
};

const getProductReviews = async (productId, page, limit, filters = {}) => {
  const query = { product: productId, status: 'APPROVED' };
  if (filters.rating) query.rating = filters.rating;

  const [items, total, distAgg] = await Promise.all([
    Review.find(query).sort({ helpfulCount: -1, createdAt: -1 }).skip(skipFor(page, limit)).limit(limit).populate('customer', 'name'),
    Review.countDocuments(query),
    Review.aggregate([
      { $match: { product: oid(productId), status: 'APPROVED' } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]),
  ]);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  distAgg.forEach((d) => { distribution[d._id] = d.count; });

  return { items: items.map(firstName), distribution, pagination: paginationMeta(total, page, limit) };
};

const getReviewById = async (id, user) => {
  const review = await Review.findById(id).populate('customer', 'name');
  if (!review) throw new AppError('Review not found', 404);
  const ownerId = review.customer && review.customer._id ? review.customer._id.toString() : null;
  if (ownerId !== user.id && user.role !== 'admin') throw new AppError('Forbidden', 403);
  return review;
};

const getMyReviews = async (customerId, page, limit) => {
  const [items, total] = await Promise.all([
    Review.find({ customer: customerId }).sort({ createdAt: -1 }).skip(skipFor(page, limit)).limit(limit).populate('product', 'title slug images'),
    Review.countDocuments({ customer: customerId }),
  ]);
  return { items, pagination: paginationMeta(total, page, limit) };
};

const updateReview = async (id, customerId, payload) => {
  const review = await Review.findById(id);
  if (!review || review.customer.toString() !== customerId) throw new AppError('Review not found', 404);

  if (payload.rating !== undefined) review.rating = payload.rating;
  if (payload.comment !== undefined) review.comment = payload.comment;
  if (payload.title !== undefined) review.title = payload.title;
  await review.save();
  await recalcProductRating(review.product);
  return review;
};

const deleteReview = async (id, user) => {
  const review = await Review.findById(id);
  if (!review) throw new AppError('Review not found', 404);
  if (review.customer.toString() !== user.id && user.role !== 'admin') throw new AppError('Forbidden', 403);
  await review.deleteOne();
  await recalcProductRating(review.product);
  return review;
};

/** One vote per customer; you cannot vote for your own review. */
const markHelpful = async (id, userId) => {
  const res = await Review.updateOne(
    { _id: id, status: 'APPROVED', customer: { $ne: userId }, helpfulBy: { $ne: userId } },
    { $addToSet: { helpfulBy: userId }, $inc: { helpfulCount: 1 } }
  );
  if (res.modifiedCount === 1) return Review.findById(id);

  const existing = await Review.findById(id).select('customer status');
  if (!existing || existing.status !== 'APPROVED') throw new AppError('Review not found', 404);
  if (existing.customer.toString() === userId) throw new AppError('You cannot mark your own review as helpful', 409);
  throw new AppError('You already marked this review as helpful', 409);
};

const moderateReview = async (id, status, note) => {
  const review = await Review.findById(id);
  if (!review) throw new AppError('Review not found', 404);
  review.status = status;
  review.moderationNote = note || undefined;
  await review.save();
  await recalcProductRating(review.product);
  return review;
};

const listAllReviews = async (f, page, limit) => {
  const query = {};
  if (f.status) query.status = f.status;
  if (f.productId) query.product = f.productId;
  if (f.customerId) query.customer = f.customerId;
  if (f.rating) query.rating = f.rating;

  const [items, total] = await Promise.all([
    Review.find(query).sort({ createdAt: -1 }).skip(skipFor(page, limit)).limit(limit).populate('customer', 'name email').populate('product', 'title slug'),
    Review.countDocuments(query),
  ]);
  return { items, pagination: paginationMeta(total, page, limit) };
};

module.exports = {
  addReview, getProductReviews, getReviewById, getMyReviews, updateReview, deleteReview,
  markHelpful, moderateReview, listAllReviews, recalcProductRating,
};
