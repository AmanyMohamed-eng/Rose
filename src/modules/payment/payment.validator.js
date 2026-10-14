const { z, objectId, pageQuery } = require('../../validators/common');

// Zod schemas run through validate(): unlike the previous hand-written checks they also cope with a
// missing body (Express 5 leaves req.body undefined for body-less requests, e.g. a full refund).
const initiate = z.object({ orderId: objectId });

const refund = z.object({
  amount: z.number().positive('Refund amount must be a positive number').max(1e7).optional(),
  reason: z.string().trim().max(300, 'Reason too long (max 300)').optional(),
});

const orderParams = z.object({ orderId: objectId });

const listQuery = z.object({
  ...pageQuery,
  status: z
    .enum(['CREATED', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED'])
    .optional(),
  provider: z.enum(['STRIPE', 'PAYMOB', 'FAWRY', 'COD']).optional(),
  customerId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

module.exports = { initiate, refund, orderParams, listQuery };
