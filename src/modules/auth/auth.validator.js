const { z, email, phone, httpUrl, password } = require('../../validators/common');

const name = z.string().trim().min(2, 'Name must be at least 2 characters').max(60);

// NOTE: `role` is intentionally absent — zod strips it, so clients can never choose their own role.
const register = z.object({ name, email, password, phone: phone.optional() });

const registerFlorist = z.object({
  name,
  email,
  password,
  phone,
  businessName: z.string().trim().min(2).max(120),
  licenseNumber: z.string().trim().min(3).max(60),
  nationalId: z.string().trim().min(5).max(30).optional(),
  businessAddress: z.string().trim().min(5).max(250),
  documents: z
    .array(z.object({ label: z.string().trim().min(2).max(80), url: httpUrl }))
    .min(1, 'At least one verification document is required')
    .max(5),
});

const login = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
});

const updateMe = z
  .object({ name: name.optional(), phone: phone.optional() })
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');

const changePassword = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});

module.exports = { register, registerFlorist, login, updateMe, changePassword };
