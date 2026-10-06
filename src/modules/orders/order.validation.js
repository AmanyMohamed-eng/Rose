const AppError = require('../../utils/AppError');

const DELIVERY_SLOTS = ['09:00-12:00', '12:00-15:00', '15:00-18:00', '18:00-21:00'];
const SIZES = ['Standard', 'Deluxe', 'Premium'];

const validateCreateOrder = (body) => {
  const { items, delivery, paymentMethod, couponCode } = body;

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('Order must contain at least one item', 400);
  }
  items.forEach((item, idx) => {
    const tag = `Item ${idx + 1}`;
    if (!item.productId) throw new AppError(`${tag}: productId is required`, 400);
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new AppError(`${tag}: quantity must be a positive integer`, 400);
    }
    if (item.size && !SIZES.includes(item.size)) {
      throw new AppError(`${tag}: invalid size`, 400);
    }
    if (item.cardMessage && item.cardMessage.length > 300) {
      throw new AppError(`${tag}: card message too long (max 300)`, 400);
    }
    if (item.wrappingNote && item.wrappingNote.length > 300) {
      throw new AppError(`${tag}: wrapping note too long (max 300)`, 400);
    }
  });

  if (!delivery || typeof delivery !== 'object') {
    throw new AppError('Delivery information is required', 400);
  }
  const required = ['recipientName', 'recipientPhone', 'addressLine1', 'city', 'deliveryDate', 'slot'];
  required.forEach((field) => {
    if (!delivery[field]) throw new AppError(`Delivery: ${field} is required`, 400);
  });
  if (!/^\+?\d{7,15}$/.test(delivery.recipientPhone)) {
    throw new AppError('Delivery: invalid phone number', 400);
  }
  if (!DELIVERY_SLOTS.includes(delivery.slot)) {
    throw new AppError('Delivery: invalid time slot', 400);
  }
  const date = new Date(delivery.deliveryDate);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('Delivery: invalid date', 400);
  }
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  if (date < todayMidnight) {
    throw new AppError('Delivery date cannot be in the past', 400);
  }

  if (!['COD', 'ONLINE'].includes(paymentMethod)) {
    throw new AppError('Invalid payment method', 400);
  }

  if (couponCode != null && (typeof couponCode !== 'string' || couponCode.length > 30)) {
    throw new AppError('Invalid coupon code', 400);
  }
};

const validateUpdateStatus = (body) => {
  const allowed = [
    'CONFIRMED',
    'PREPARING',
    'READY',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED',
  ];
  if (!body.status || !allowed.includes(body.status)) {
    throw new AppError('Invalid status', 400);
  }
  if (body.note && body.note.length > 200) {
    throw new AppError('Note too long (max 200)', 400);
  }
};

const validateAssignFlorist = (body) => {
  if (!body.floristId) throw new AppError('floristId is required', 400);
  if (!/^[0-9a-fA-F]{24}$/.test(body.floristId)) {
    throw new AppError('Invalid floristId', 400);
  }
};

const validateCancel = (body) => {
  if (body.reason && body.reason.length > 300) {
    throw new AppError('Cancellation reason too long (max 300)', 400);
  }
};

module.exports = {
  validateCreateOrder,
  validateUpdateStatus,
  validateAssignFlorist,
  validateCancel,
  DELIVERY_SLOTS,
  SIZES,
};