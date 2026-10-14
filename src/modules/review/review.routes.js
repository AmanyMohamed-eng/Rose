const express = require('express');
const ctrl = require('./review.controller');
const v = require('./review.validator');
const validate = require('../../middleware/validate.middleware');
const authenticate = require('../../middleware/auth.middleware');
const { allowRoles } = require('../../middleware/role.middleware');
const { ROLES } = require('../../constants');

// Mounted by the products router at /api/v1/products/:productId/reviews (public, approved reviews only).
const productReviewRouter = express.Router({ mergeParams: true });
productReviewRouter.get('/', validate({ params: v.productParams, query: v.productReviewsQuery }), ctrl.getProductReviews);

// Mounted at /api/v1/reviews
const reviewRouter = express.Router();
reviewRouter.use(authenticate);

const customer = allowRoles(ROLES.CUSTOMER);
const admin = allowRoles(ROLES.ADMIN);

reviewRouter.post('/', customer, validate({ body: v.create }), ctrl.addReview);
reviewRouter.get('/my', customer, validate({ query: v.myReviewsQuery }), ctrl.getMyReviews);

reviewRouter.get('/admin/all', admin, validate({ query: v.adminListQuery }), ctrl.listAllReviews);
reviewRouter.patch('/:id/moderate', admin, validate({ params: v.idParams, body: v.moderate }), ctrl.moderateReview);

reviewRouter.post('/:id/helpful', customer, validate({ params: v.idParams }), ctrl.markHelpful);
reviewRouter.get('/:id', allowRoles(ROLES.CUSTOMER, ROLES.ADMIN), validate({ params: v.idParams }), ctrl.getReview);
reviewRouter.patch('/:id', customer, validate({ params: v.idParams, body: v.update }), ctrl.updateReview);
reviewRouter.delete('/:id', allowRoles(ROLES.CUSTOMER, ROLES.ADMIN), validate({ params: v.idParams }), ctrl.deleteReview);

module.exports = { productReviewRouter, reviewRouter };
