const paymentService = require('./payment.service');
const { logAction } = require('../admin/adminLog.service');

// Response bodies keep their original top-level fields (clients may already depend on them);
// `success: true` is added so they match the `{ success, ... }` envelope used by the rest of the API.

const initiate = async (req, res, next) => {
  try {
    const { payment, clientSecret } = await paymentService.initiatePayment(req.user.id, req.body.orderId);

    res.status(201).json({
      success: true,
      message: 'Payment initiated',
      paymentId: payment._id,
      clientSecret,
      amount: payment.amount,
      currency: payment.currency,
    });
  } catch (e) {
    next(e);
  }
};

const getMyPayment = async (req, res, next) => {
  try {
    const payment = await paymentService.getPaymentByOrder(req.params.orderId, req.user);
    res.status(200).json({ success: true, payment });
  } catch (e) {
    next(e);
  }
};

const listPayments = async (req, res, next) => {
  try {
    const { page, limit, ...filters } = req.query;
    const result = await paymentService.listPayments(filters, page, limit);
    res.status(200).json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
};

const refund = async (req, res, next) => {
  try {
    const payment = await paymentService.refundOrder(
      req.params.orderId,
      req.body.amount,
      req.body.reason,
      req.user.id
    );
    logAction(req, 'ORDER_REFUNDED', 'ORDER', req.params.orderId, {
      after: { refundedAmount: payment.refundedAmount, status: payment.status },
      note: req.body.reason,
    });
    res.status(200).json({ success: true, message: 'Refund issued', payment });
  } catch (e) {
    next(e);
  }
};

const stripeWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ success: false, message: 'Missing signature' });
    }

    const result = await paymentService.handleStripeWebhook(req.body, signature);
    return res.status(200).json(result);
  } catch (e) {
    return next(e);
  }
};

module.exports = { initiate, getMyPayment, listPayments, refund, stripeWebhook };
