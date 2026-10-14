const express = require('express');

const router = express.Router();

const controller = require('./payment.controller');
const v = require('./payment.validator');
const validate = require('../../middleware/validate.middleware');
const authMiddleware = require('../../middleware/auth.middleware');
const { allowRoles } = require('../../middleware/role.middleware');

router.use(authMiddleware);

router.post('/initiate', allowRoles('customer'), validate({ body: v.initiate }), controller.initiate);
router.get('/order/:orderId', validate({ params: v.orderParams }), controller.getMyPayment);

router.get('/', allowRoles('admin'), validate({ query: v.listQuery }), controller.listPayments);
router.post(
  '/order/:orderId/refund',
  allowRoles('admin'),
  validate({ params: v.orderParams, body: v.refund }),
  controller.refund
);

// Stripe needs the *raw* body to verify the signature. Mounted in app.js BEFORE express.json().
const webhookRouter = express.Router();
webhookRouter.post('/stripe', express.raw({ type: 'application/json' }), controller.stripeWebhook);

module.exports = { paymentRouter: router, webhookRouter };
