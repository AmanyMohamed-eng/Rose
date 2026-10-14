const Stripe = require('stripe');
const AppError = require('../../../utils/AppError');

let client;

/**
 * Lazily created so the app can boot (and every non-payment route work) even when Stripe is not configured.
 * Previously `new Stripe(undefined)` ran at require-time.
 */
const getStripe = () => {
  if (!client) {
    if (!process.env.STRIPE_SECRET_KEY) throw new AppError('Online payments are not configured', 503);
    client = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  }
  return client;
};

const createPaymentIntent = async ({ amount, currency, metadata, idempotencyKey }) => {
  const stripe = getStripe();
  try {
    return await stripe.paymentIntents.create(
      {
        amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
        metadata,
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey }
    );
  } catch (err) {
    throw new AppError(`Payment provider error: ${err.message}`, 502);
  }
};

const retrievePaymentIntent = async (intentId) => {
  const stripe = getStripe();
  try {
    return await stripe.paymentIntents.retrieve(intentId);
  } catch (err) {
    throw new AppError(`Payment provider error: ${err.message}`, 502);
  }
};

/** Cancels an intent that has not been paid yet, so a cancelled order can no longer be charged. */
const cancelPaymentIntent = async (intentId) => {
  const stripe = getStripe();
  try {
    return await stripe.paymentIntents.cancel(intentId);
  } catch (err) {
    throw new AppError(`Payment provider error: ${err.message}`, 502);
  }
};

const refundPayment = async ({ chargeId, amount, idempotencyKey }) => {
  const stripe = getStripe();
  try {
    return await stripe.refunds.create(
      {
        charge: chargeId,
        amount: amount ? Math.round(amount * 100) : undefined,
      },
      { idempotencyKey }
    );
  } catch (err) {
    throw new AppError(`Refund error: ${err.message}`, 502);
  }
};

const verifyWebhook = (rawBody, signature) => {
  const stripe = getStripe();
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new AppError('Stripe webhook secret is not configured', 503);
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    throw new AppError(`Invalid webhook signature: ${err.message}`, 400);
  }
};

module.exports = {
  createPaymentIntent,
  retrievePaymentIntent,
  cancelPaymentIntent,
  refundPayment,
  verifyWebhook,
};
