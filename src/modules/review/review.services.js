const Review = require('../../models/review');
const Product = require('../../models/product');
const Order = require('../../models/order');
const AppError = require('../../utils/AppError');

const recalcProductRating = async (productId) => {
  const agg = await Review.aggregate([
    { $match: { product: productId, status: 'APPROVED' } },
    {
      $group: {
        _id: '$product',
        avg: { $avg: '$rating' },
        count: { $sum: 1 },
      },
    },
  ]);

  const stats = agg[0] || { avg: 0, count: 0 };
  const rounded = Math.round(stats.avg * 10) / 10; // 4.7, not 4.666...

  await Product.updateOne(
    { _id: productId },
    { $set: { ratingsAverage: rounded, ratingsCount: stats.count } }
  );
};

const addReview = async (customerId, payload) => {
  const { productId, orderId, rating, comment, title } = payload;

  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    throw new AppError('Product not found', 404);
  }

  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);
  if (order.customer.toString() !== customerId) {
    throw new AppError('You can only review your own orders', 403);
  }
  if (order.status !== 'DELIVERED') {
    throw new AppError('You can only review delivered orders', 400);
  }

  const item = order.items.find(
    (i) => i.product.toString() === productId
  );
  if (!item) {
    throw new AppError('This product is not part of that order', 400);
  }

  const existing = await Review.findOne({ product: productId, customer: customerId });
  if (existing) {
    throw new AppError('You have already reviewed this product', 409);
  }

  const review = await Review.create({
    product: productId,
    customer: customerId,
    order: orderId,
    rating,
    title,
    comment: comment.trim(),
    status: 'APPROVED',
  });

  if (!order.isReviewed) {
    order.isReviewed = true;
    await order.save().catch(() => {});
  }

  await recalcProductRating(productId);
  return review;
};

const getProductReviews = async (productId, page = 1, limit = 10, filters = {}) => {
  const query = { product: productId, status: 'APPROVED' };

  if (filters.rating) query.rating = Number(filters.rating);
  if (filters.verifiedOnly === 'true') query.order = { $exists: true };

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Review.find(query)
      .sort({ helpfulCount: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('customer', 'name'),
    Review.countDocuments(query),
  ]);

  const distAgg = await Review.aggregate([
    { $match: { product: productId, status: 'APPROVED' } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
  ]);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  distAgg.forEach((d) => (distribution[d._id] = d.count));

  return {
    items,
    distribution,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  };
};

const getReviewById = async (id, user) => {
  const review = await Review.findById(id).populate('customer', 'name');
  if (!review) throw new AppError('Review not found', 404);

  const isOwner = review.customer._id.toString() === user.id;
  const isAdmin = user.role === 'admin';
  if (!isOwner && !isAdmin) throw new AppError('Forbidden', 403);

  return review;
};

const getMyReviews = async (customerId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Review.find({ customer: customerId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('product', 'title slug images'),
    Review.countDocuments({ customer: customerId }),
  ]);
  return { items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
};

const updateReview = async (id, customerId, payload) => {
  const review = await Review.findById(id);
  if (!review) throw new AppError('Review not found', 404);
  if (review.customer.toString() !== customerId) {
    throw new AppError('You can only edit your own review', 403);
  }

  if (payload.rating != null) review.rating = payload.rating;
  if (payload.comment != null) review.comment = payload.comment.trim();
  if (payload.title != null) review.title = payload.title;

  await review.save();
  await recalcProductRating(review.product);
  return review;
};

const deleteReview = async (id, user) => {
  const review = await Review.findById(id);
  if (!review) throw new AppError('Review not found', 404);

  const isOwner = review.customer.toString() === user.id;
  const isAdmin = user.role === 'admin';
  if (!isOwner && !isAdmin) throw new AppError('Forbidden', 403);

  const productId = review.product;
  await review.deleteOne();
  await recalcProductRating(productId);
};

const markHelpful = async (id) => {
  const review = await Review.findByIdAndUpdate(
    id,
    { $inc: { helpfulCount: 1 } },
    { new: true }
  );
  if (!review) throw new AppError('Review not found', 404);
  return review;
};

const moderateReview = async (id, status, note) => {
  const review = await Review.findById(id);
  if (!review) throw new AppError('Review not found', 404);

  review.status = status;
  if (note) review.moderationNote = note;
  await review.save();

  await recalcProductRating(review.product);
  return review;
};

const listAllReviews = async (filters = {}, page = 1, limit = 20) => {
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.productId) query.product = filters.productId;
  if (filters.customerId) query.customer = filters.customerId;
  if (filters.rating) query.rating = Number(filters.rating);

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Review.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('customer', 'name email')
      .populate('product', 'title slug'),
    Review.countDocuments(query),
  ]);
  return { items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
};

module.exports = {
  addReview,
  getProductReviews,
  getReviewById,
  getMyReviews,
  updateReview,
  deleteReview,
  markHelpful,
  moderateReview,
  listAllReviews,
  recalcProductRating,
};