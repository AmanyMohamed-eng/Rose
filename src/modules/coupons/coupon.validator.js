const { z, objectId, pageQuery, boolQuery, searchText } = require('../../validators/common');
const { DISCOUNT_TYPES } = require('../../constants');

const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,20}$/, 'Code must be 3-20 characters: letters, digits, - or _');

const shape = {
  description: z.string().trim().max(200),
  discountType: z.enum(DISCOUNT_TYPES),
  discountValue: z.number().positive().max(1e6),
  maxDiscountAmount: z.number().min(0).max(1e6).nullable(),
  minOrderAmount: z.number().min(0).max(1e7),
  startDate: z.coerce.date(),
  expiryDate: z.coerce.date(),
  usageLimit: z.number().int().min(1).nullable(),
  usageLimitPerCustomer: z.number().int().min(1).max(1000),
  isActive: z.boolean(),
};

const crossChecks = (v, ctx) => {
  if (v.discountType === 'PERCENTAGE' && v.discountValue !== undefined && v.discountValue > 100) {
    ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'Percentage discount cannot exceed 100' });
  }
  if (v.startDate && v.expiryDate && v.expiryDate <= v.startDate) {
    ctx.addIssue({ code: 'custom', path: ['expiryDate'], message: 'Expiry date must be after start date' });
  }
};

const create = z
  .object({
    code,
    description: shape.description.optional(),
    discountType: shape.discountType,
    discountValue: shape.discountValue,
    maxDiscountAmount: shape.maxDiscountAmount.optional(),
    minOrderAmount: shape.minOrderAmount.optional(),
    startDate: shape.startDate.optional(),
    expiryDate: shape.expiryDate,
    usageLimit: shape.usageLimit.optional(),
    usageLimitPerCustomer: shape.usageLimitPerCustomer.optional(),
    isActive: shape.isActive.optional(),
  })
  .superRefine(crossChecks);

// `code` is immutable once created.
const update = z
  .object(shape)
  .partial()
  .superRefine(crossChecks)
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');

const list = z.object({
  ...pageQuery,
  isActive: boolQuery.optional(),
  expired: boolQuery.optional(),
  search: searchText.optional(),
});

const validateCoupon = z.object({ code });

const idParams = z.object({ id: objectId });

module.exports = { create, update, list, validateCoupon, idParams };
