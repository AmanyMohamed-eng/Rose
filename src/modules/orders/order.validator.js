const { z, objectId, phone, pageQuery, boolQuery } = require('../../validators/common');
const { DELIVERY_SLOTS, SIZES, PAYMENT_METHODS, ORDER_STATUS, FLORIST_SETTABLE } = require('../../constants');

const item = z.object({
  productId: objectId,
  quantity: z.number({ message: 'quantity must be a positive integer' }).int('quantity must be a positive integer').min(1, 'quantity must be a positive integer').max(50),
  size: z.enum(SIZES).optional(),
  cardMessage: z.string().trim().max(300, 'card message too long (max 300)').optional(),
  wrappingNote: z.string().trim().max(300, 'wrapping note too long (max 300)').optional(),
});

const startOfTodayUTC = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const delivery = z.object({
  recipientName: z.string().trim().min(2).max(80),
  recipientPhone: phone,
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().length(2).toUpperCase().optional(),
  deliveryDate: z.coerce.date().refine((d) => d >= startOfTodayUTC(), 'Delivery date cannot be in the past'),
  slot: z.enum(DELIVERY_SLOTS),
  notes: z.string().trim().max(300).optional(),
});

const createOrder = z.object({
  items: z.array(item).min(1, 'Order must contain at least one item').max(30),
  delivery,
  paymentMethod: z.enum(PAYMENT_METHODS),
  couponCode: z.string().trim().toUpperCase().max(30).optional(),
});

const updateStatus = z.object({
  status: z.enum(Object.values(ORDER_STATUS).filter((s) => s !== 'PLACED')),
  note: z.string().trim().max(200).optional(),
});

const prepStatus = z.object({
  status: z.enum(FLORIST_SETTABLE, { message: 'Florist can only set PREPARING or READY' }),
  note: z.string().trim().max(200).optional(),
});

const assignFlorist = z.object({ floristId: objectId });
const cancel = z.object({ reason: z.string().trim().max(300).optional() });

const payment = z.object({
  paymentStatus: z.enum(['PAID', 'FAILED']),
  transactionRef: z.string().trim().max(100).optional(),
});

const myOrdersQuery = z.object({
  ...pageQuery,
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(Object.values(ORDER_STATUS)).optional(),
});

const adminListQuery = z.object({
  ...pageQuery,
  status: z.enum(Object.values(ORDER_STATUS)).optional(),
  floristId: objectId.optional(),
  customerId: objectId.optional(),
  unassigned: boolQuery.optional(),
  date: z.coerce.date().optional(),
});

const floristQueueQuery = z.object({
  ...pageQuery,
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(Object.values(ORDER_STATUS)).optional(),
});

const idParams = z.object({ id: objectId });

module.exports = {
  createOrder, updateStatus, prepStatus, assignFlorist, cancel, payment,
  myOrdersQuery, adminListQuery, floristQueueQuery, idParams,
};
