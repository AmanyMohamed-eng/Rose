const reviewService = require('./review.services');
const {
  validateCreateReview,
  validateUpdateReview,
  validateModeration,
} = require('./review.validation');

const addReview = async (req, res, next) => {
  try {
    validateCreateReview(req.body);
    const review = await reviewService.addReview(req.user.id, req.body);
    res.status(201).json({ message: 'Review submitted', review });
  } catch (e) { next(e); }
};

const getMyReviews = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const result = await reviewService.getMyReviews(req.user.id, page, limit);
    res.status(200).json(result);
  } catch (e) { next(e); }
};

const updateReview = async (req, res, next) => {
  try {
    validateUpdateReview(req.body);
    const review = await reviewService.updateReview(req.params.id, req.user.id, req.body);
    res.status(200).json({ message: 'Review updated', review });
  } catch (e) { next(e); }
};

const deleteReview = async (req, res, next) => {
  try {
    await reviewService.deleteReview(req.params.id, req.user);
    res.status(204).send();
  } catch (e) { next(e); }
};

const getProductReviews = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const result = await reviewService.getProductReviews(
      req.params.productId, page, limit, req.query
    );
    res.status(200).json(result);
  } catch (e) { next(e); }
};

const markHelpful = async (req, res, next) => {
  try {
    const review = await reviewService.markHelpful(req.params.id);
    res.status(200).json({ message: 'Marked as helpful', helpfulCount: review.helpfulCount });
  } catch (e) { next(e); }
};

const getReview = async (req, res, next) => {
  try {
    const review = await reviewService.getReviewById(req.params.id, req.user);
    res.status(200).json({ review });
  } catch (e) { next(e); }
};

const listAllReviews = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const result = await reviewService.listAllReviews(req.query, page, limit);
    res.status(200).json(result);
  } catch (e) { next(e); }
};

const moderateReview = async (req, res, next) => {
  try {
    validateModeration(req.body);
    const review = await reviewService.moderateReview(
      req.params.id, req.body.status, req.body.note
    );
    res.status(200).json({ message: `Review ${req.body.status.toLowerCase()}`, review });
  } catch (e) { next(e); }
};

module.exports = {
  addReview,
  getMyReviews,
  updateReview,
  deleteReview,
  getProductReviews,
  markHelpful,
  getReview,
  listAllReviews,
  moderateReview,
};