const express = require('express');

const reviewController = require('./review.controller');
const authMiddleware = require('../../middleware/auth.middleware');
const { allowRoles } = require('../../middleware/role.middleware');

const productReviewRouter = express.Router({ mergeParams: true });

productReviewRouter.get('/', reviewController.getProductReviews);

const reviewRouter = express.Router();

reviewRouter.post('/:id/helpful', reviewController.markHelpful);

reviewRouter.use(authMiddleware);

reviewRouter.post('/', allowRoles('customer'), reviewController.addReview);
reviewRouter.get('/my', allowRoles('customer'), reviewController.getMyReviews);

reviewRouter.get('/admin/all', allowRoles('admin'), reviewController.listAllReviews);
reviewRouter.patch('/:id/moderate', allowRoles('admin'), reviewController.moderateReview);

reviewRouter.get('/:id', reviewController.getReview);
reviewRouter.patch('/:id', allowRoles('customer'), reviewController.updateReview);
reviewRouter.delete('/:id', reviewController.deleteReview);

module.exports = { productReviewRouter, reviewRouter };