const { z, objectId, email, phone, httpUrl, password, pageQuery, boolQuery, searchText } = require('../../validators/common');
const { ADMIN_ACTIONS, ADMIN_TARGETS, FLORIST_STATUS } = require('../../constants');

const name = z.string().trim().min(2).max(60);

const listUsers = z.object({
  ...pageQuery,
  role: z.enum(['admin', 'florist', 'customer']).optional(),
  isActive: boolQuery.optional(),
  search: searchText.optional(),
});

const updateUser = z
  .object({ name, phone })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');

// Only customer <-> admin changes are possible here. Florists come through registration + approval.
const updateRole = z.object({ role: z.enum(['customer', 'admin']) });

const setActive = z.object({ reason: z.string().trim().max(300).optional() });

const listFlorists = z.object({
  ...pageQuery,
  approvalStatus: z.enum(Object.values(FLORIST_STATUS)).optional(),
  search: searchText.optional(),
});

const createFlorist = z.object({
  name,
  email,
  password,
  phone,
  businessName: z.string().trim().min(2).max(120).optional(),
  licenseNumber: z.string().trim().min(3).max(60).optional(),
  businessAddress: z.string().trim().min(5).max(250).optional(),
  bio: z.string().trim().max(500).optional(),
  specialties: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
});

const updateFloristProfile = z
  .object({
    bio: z.string().trim().max(500),
    specialties: z.array(z.string().trim().min(1).max(40)).max(15),
    yearsExperience: z.number().int().min(0).max(80),
    shiftStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM'),
    shiftEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM'),
    isAvailable: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');

const rejectFlorist = z.object({ reason: z.string().trim().min(3, 'A rejection reason is required').max(300) });

const logsQuery = z.object({
  ...pageQuery,
  limit: z.coerce.number().int().min(1).max(100).default(50),
  adminId: objectId.optional(),
  action: z.enum(ADMIN_ACTIONS).optional(),
  targetType: z.enum(ADMIN_TARGETS).optional(),
  targetId: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const updateProfile = z
  .object({
    department: z.enum(['OWNER', 'OPERATIONS', 'FINANCE', 'SUPPORT', 'MARKETING']),
    title: z.string().trim().max(80),
    bio: z.string().trim().max(500),
    avatar: httpUrl,
    phone,
    notifyOnLowStock: z.boolean(),
    notifyOnNewOrder: z.boolean(),
    notifyOnNegativeReview: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');

const idParams = z.object({ id: objectId });

module.exports = {
  listUsers, updateUser, updateRole, setActive, listFlorists, createFlorist, updateFloristProfile,
  rejectFlorist, logsQuery, updateProfile, idParams,
};
