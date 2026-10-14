const Payment = require('../../models/Payment');
const Order = require('../../models/Order');
const stripeProvider = require('./providers/stripe.provider');
const AppError = require('../../utils/AppError');
const { round2 } = require('../../utils/helpers');

const OPEN_STATUSES = ['CREATED', 'REQUIRES_ACTION', 'PROCESSING'];
const RETRYABLE_STATUSES = ['FAILED', 'CANCELLED'];

/**
 * Idempotency keys MUST be deterministic: retrying the same logical operation has to present the same key so
 * Stripe returns the original result instead of charging / refunding twice. (They used to embed a random UUID,
 * which made every retry look like a brand-new operation.)
 */
const idempotencyKey = (...parts) => parts.join(':');

const toCents = (amount) => Math.round(amount * 100);

const initiatePayment = async (customerId, orderId) => {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);
  if (order.customer.toString() !== customerId) {
    throw new AppError('Not your order', 403);
  }
  if (order.paymentMethod !== 'ONLINE') {
    throw new AppError('Order is not set for online payment', 400);
  }
  if (order.paymentStatus === 'PAID') {
    throw new AppError('Order is already paid', 409);
  }
  if (!order.isCancellable) {
    throw new AppError('Order can no longer be paid', 409);
  }

  let payment = await Payment.findOne({ order: orderId }).select('+clientSecret');
  if (payment && OPEN_STATUSES.includes(payment.status)) {
    return { payment, clientSecret: payment.clientSecret };
  }
  if (payment && !RETRYABLE_STATUSES.includes(payment.status)) {
    throw new AppError('Payment already completed or refunded', 409);
  }

  // A FAILED / CANCELLED payment (declined card, abandoned intent) may be retried with a fresh intent.
  const intent = await stripeProvider.createPaymentIntent({
    amount: order.total,
    currency: 'EGP',
    metadata: {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      customerId: customerId.toString(),
    },
    idempotencyKey: idempotencyKey('initiate', orderId, payment ? payment.providerIntentId : 'first'),
  });
  const status = intent.status === 'requires_action' ? 'REQUIRES_ACTION' : 'CREATED';

  if (payment) {
    payment.providerIntentId = intent.id;
    payment.clientSecret = intent.client_secret;
    payment.amount = order.total;
    payment.status = status;
    payment.failureReason = undefined;
    await payment.save();
    return { payment, clientSecret: intent.client_secret };
  }

  try {
    payment = await Payment.create({
      order: order._id,
      customer: customerId,
      provider: 'STRIPE',
      method: 'CARD',
      providerIntentId: intent.id,
      clientSecret: intent.client_secret,
      amount: order.total,
      currency: 'EGP',
      status,
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
    // Two concurrent initiate calls: the other one won (same idempotency key => same intent). Return its record.
    payment = await Payment.findOne({ order: orderId }).select('+clientSecret');
    return { payment, clientSecret: payment.clientSecret };
  }

  return { payment, clientSecret: intent.client_secret };
};

const handleStripeWebhook = async (rawBody, signature) => {
  const event = stripeProvider.verifyWebhook(rawBody, signature);

  const alreadyProcessed = await Payment.exists({ processedEventIds: event.id });
  if (alreadyProcessed) return { skipped: true, reason: 'duplicate event' };

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const intent = event.data.object;
      const payment = await Payment.findOne({ providerIntentId: intent.id });
      if (!payment) return { skipped: true, reason: 'unknown intent' };
      if (['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(payment.status)) {
        await Payment.updateOne({ _id: payment._id }, { $addToSet: { processedEventIds: event.id } });
        return { skipped: true, reason: 'payment already settled' };
      }

      // Compare in integer cents — comparing floats (e.g. 1234.5 vs 1234.50000001) can spuriously fail.
      const receivedCents = Math.round(intent.amount_received);
      if (receivedCents !== toCents(payment.amount)) {
        await Payment.updateOne(
          { _id: payment._id },
          {
            $set: {
              status: 'FAILED',
              failureReason: `Amount mismatch: expected ${payment.amount}, got ${receivedCents / 100}`,
            },
            $addToSet: { processedEventIds: event.id },
          }
        );
        return { skipped: true, reason: 'amount mismatch' };
      }

      payment.status = 'SUCCEEDED';
      payment.providerChargeId =
        typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id;
      payment.paidAt = new Date();
      payment.processedEventIds.push(event.id);
      await payment.save();

      const order = await Order.findById(payment.order).select('status');
      await Order.updateOne(
        { _id: payment.order },
        { $set: { paymentStatus: 'PAID', paidAt: payment.paidAt } }
      );

      // The customer paid for an order that was cancelled in the meantime: give the money straight back.
      if (order && order.status === 'CANCELLED') {
        try {
          await refundOrder(payment.order, null, 'Order was cancelled before the payment completed', null);
        } catch (err) {
          console.error(`[payment] auto-refund failed for order ${payment.order}:`, err.message);
        }
      }

      return { processed: true, event: event.type };
    }

    case 'payment_intent.payment_failed': {
      const intent = event.data.object;
      // Stripe does not guarantee delivery order: a late "failed" event for an earlier attempt must never overwrite
      // a payment that has already succeeded (or been refunded). Only open payments can move to FAILED.
      const res = await Payment.updateOne(
        { providerIntentId: intent.id, status: { $in: OPEN_STATUSES } },
        {
          $set: {
            status: 'FAILED',
            failureReason: String(intent.last_payment_error?.message || 'Payment failed').slice(0, 300),
          },
          $addToSet: { processedEventIds: event.id },
        }
      );
      if (res.matchedCount === 0) {
        await Payment.updateOne({ providerIntentId: intent.id }, { $addToSet: { processedEventIds: event.id } });
        return { skipped: true, reason: 'payment not in an open state' };
      }
      return { processed: true, event: event.type };
    }

    case 'charge.refunded': {
      const charge = event.data.object;
      const payment = await Payment.findOne({ providerChargeId: charge.id });
      if (!payment) return { skipped: true, reason: 'unknown charge' };

      const refundedCents = Math.round(charge.amount_refunded);
      // Out-of-order / replayed events must never LOWER the refunded total we already recorded.
      const newRefunded = Math.max(round2(payment.refundedAmount || 0), round2(refundedCents / 100));
      payment.refundedAmount = newRefunded;
      payment.status = toCents(newRefunded) >= toCents(payment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      payment.refundedAt = new Date();
      payment.processedEventIds.push(event.id);
      await payment.save();

      if (payment.status === 'REFUNDED') {
        await Order.updateOne(
          { _id: payment.order },
          { $set: { paymentStatus: 'REFUNDED' } }
        );
      }
      return { processed: true, event: event.type };
    }

    default:
      return { skipped: true, reason: `unhandled event: ${event.type}` };
  }
};

const refundOrder = async (orderId, amount, reason, adminId) => { // eslint-disable-line no-unused-vars
  const payment = await Payment.findOne({ order: orderId });
  if (!payment) throw new AppError('No payment found for this order', 404);
  if (payment.status !== 'SUCCEEDED' && payment.status !== 'PARTIALLY_REFUNDED') {
    throw new AppError(`Cannot refund a payment in status ${payment.status}`, 409);
  }
  if (!payment.providerChargeId) {
    throw new AppError('Missing charge reference — cannot refund', 409);
  }

  const maxRefundable = round2(payment.amount - payment.refundedAmount);
  const refundAmount = round2(amount ?? maxRefundable);
  if (refundAmount <= 0 || refundAmount > maxRefundable) {
    throw new AppError(`Refund must be between 0 and ${maxRefundable}`, 400);
  }

  await stripeProvider.refundPayment({
    chargeId: payment.providerChargeId,
    amount: refundAmount,
    // Same refund request (same amount against the same already-refunded balance) => same key => no double refund.
    idempotencyKey: idempotencyKey('refund', orderId, refundAmount, payment.refundedAmount),
  });

  payment.refundedAmount = round2(payment.refundedAmount + refundAmount);
  payment.status =
    payment.refundedAmount >= payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
  payment.refundedAt = new Date();
  if (reason) payment.metadata = { ...(payment.metadata || {}), refundReason: reason };
  await payment.save();

  if (payment.status === 'REFUNDED') {
    await Order.updateOne({ _id: orderId }, { $set: { paymentStatus: 'REFUNDED' } });
  }
  return payment;
};

/**
 * When an order is cancelled before it was paid, void the open PaymentIntent so the customer
 * can no longer be charged for it. Best effort: a failure here is handled by the webhook auto-refund above.
 */
const cancelPendingPayment = async (orderId) => {
  const payment = await Payment.findOne({ order: orderId });
  if (!payment || !['CREATED', 'REQUIRES_ACTION'].includes(payment.status) || !payment.providerIntentId) return;
  try {
    await stripeProvider.cancelPaymentIntent(payment.providerIntentId);
  } catch (err) {
    console.error(`[payment] could not cancel intent for order ${orderId}:`, err.message);
    return;
  }
  payment.status = 'CANCELLED';
  await payment.save();
};

const markCodPaid = async (orderId, amount) => {
  const existing = await Payment.findOne({ order: orderId });
  if (existing) {
    if (existing.status === 'SUCCEEDED') return existing;
    existing.status = 'SUCCEEDED';
    existing.paidAt = new Date();
    return existing.save();
  }
  const order = await Order.findById(orderId).select('customer');
  if (!order) throw new AppError('Order not found', 404);
  return Payment.create({
    order: orderId,
    customer: order.customer,
    provider: 'COD',
    method: 'CASH',
    amount,
    currency: 'EGP',
    status: 'SUCCEEDED',
    paidAt: new Date(),
  });
};

const getPaymentByOrder = async (orderId, user) => {
  const payment = await Payment.findOne({ order: orderId });
  if (!payment) throw new AppError('Payment not found', 404);

  const isOwner = payment.customer.toString() === user.id;
  const isAdmin = user.role === 'admin';
  if (!isOwner && !isAdmin) throw new AppError('Forbidden', 403);

  return payment;
};

const listPayments = async (filters = {}, page = 1, limit = 20) => {
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.provider) query.provider = filters.provider;
  if (filters.customerId) query.customer = filters.customerId;

  if (filters.from || filters.to) {
    query.createdAt = {};
    if (filters.from) query.createdAt.$gte = new Date(filters.from);
    if (filters.to) query.createdAt.$lte = new Date(filters.to);
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Payment.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('customer', 'name email')
      .populate('order', 'orderNumber total status'),
    Payment.countDocuments(query),
  ]);
  return { items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
};

module.exports = {
  initiatePayment,
  handleStripeWebhook,
  refundOrder,
  cancelPendingPayment,
  markCodPaid,
  getPaymentByOrder,
  listPayments,
};
