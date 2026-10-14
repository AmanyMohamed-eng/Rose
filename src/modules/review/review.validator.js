const { z, objectId, pageQuery } = require('../../validators/common');
const { REVIEW_STATUS } = require('../../constants');

const rating = z.number().int('Rating must be an integer between 1 and 5').min(1).max(5);
const comment = z.string().trim().min(3, 'Comment must be at least 3 characters').max(1000, 'Comment too long (max 1000)');
const title = z.string().trim().max(120, 'Title too long (max 120)');

const create = z.object({
  productId: objectId,
  orderId: objectId,
  rating,
  comment,
  title: title.optional(),
});

const update = z
  .object({ rating, comment, title })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');

const moderate = z.object({
  status: z.enum(['APPROVED', 'REJECTED'], { message: 'Status must be APPROVED or REJECTED' }),
  note: z.string().trim().max(300).optional(),
});

const productReviewsQuery = z.object({
  ...pageQuery,
  limit: z.coerce.number().int().min(1).max(50).default(10),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

const myReviewsQuery = z.object({ ...pageQuery, limit: z.coerce.number().int().min(1).max(50).default(10) });

const adminListQuery = z.object({
  ...pageQuery,
  status: z.enum(REVIEW_STATUS).optional(),
  productId: objectId.optional(),
  customerId: objectId.optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

const idParams = z.object({ id: objectId });
const productParams = z.object({ productId: objectId });

module.exports = { create, update, moderate, productReviewsQuery, myReviewsQuery, adminListQuery, idParams, productParams };
