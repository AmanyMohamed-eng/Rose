const service = require('./review.service');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const { logAction } = require('../admin/adminLog.service');
const { ROLES } = require('../../constants');

const addReview = asyncHandler(async (req, res) => {
  const review = await service.addReview(req.user.id, req.body);
  sendSuccess(res, { status: 201, message: 'Review submitted', data: { review } });
});

const getMyReviews = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await service.getMyReviews(req.user.id, req.query.page, req.query.limit) });
});

const updateReview = asyncHandler(async (req, res) => {
  const review = await service.updateReview(req.params.id, req.user.id, req.body);
  sendSuccess(res, { message: 'Review updated', data: { review } });
});

const deleteReview = asyncHandler(async (req, res) => {
  const review = await service.deleteReview(req.params.id, req.user);
  if (req.user.role === ROLES.ADMIN) logAction(req, 'REVIEW_DELETED', 'REVIEW', review._id, { before: { product: review.product, rating: review.rating } });
  sendSuccess(res, { message: 'Review deleted' });
});

const getProductReviews = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;
  sendSuccess(res, { data: await service.getProductReviews(req.params.productId, page, limit, filters) });
});

const markHelpful = asyncHandler(async (req, res) => {
  const review = await service.markHelpful(req.params.id, req.user.id);
  sendSuccess(res, { message: 'Marked as helpful', data: { helpfulCount: review.helpfulCount } });
});

const getReview = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { review: await service.getReviewById(req.params.id, req.user) } });
});

const listAllReviews = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;
  sendSuccess(res, { data: await service.listAllReviews(filters, page, limit) });
});

const moderateReview = asyncHandler(async (req, res) => {
  const review = await service.moderateReview(req.params.id, req.body.status, req.body.note);
  logAction(req, review.status === 'APPROVED' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED', 'REVIEW', review._id, { note: req.body.note });
  sendSuccess(res, { message: `Review ${review.status.toLowerCase()}`, data: { review } });
});

module.exports = {
  addReview, getMyReviews, updateReview, deleteReview, getProductReviews, markHelpful, getReview, listAllReviews, moderateReview,
};
