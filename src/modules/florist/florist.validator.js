const { z, objectId, httpUrl, pageQuery } = require('../../validators/common');

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM');

const updateProfile = z
  .object({
    bio: z.string().trim().max(500),
    specialties: z.array(z.string().trim().min(1).max(40)).max(15),
    yearsExperience: z.number().int().min(0).max(80),
    shiftStart: time,
    shiftEnd: time,
    avatar: httpUrl,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');

const updateVerification = z.object({
  businessName: z.string().trim().min(2).max(120),
  licenseNumber: z.string().trim().min(3).max(60),
  nationalId: z.string().trim().min(5).max(30).optional(),
  businessAddress: z.string().trim().min(5).max(250),
  documents: z
    .array(z.object({ label: z.string().trim().min(2).max(80), url: httpUrl }))
    .min(1, 'At least one verification document is required')
    .max(5),
});

const productListQuery = z.object({
  ...pageQuery,
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: objectId.optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

module.exports = { updateProfile, updateVerification, productListQuery };
