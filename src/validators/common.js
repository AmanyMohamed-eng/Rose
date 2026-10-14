const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const email = z.string().trim().toLowerCase().email('Invalid email address').max(254);
const phone = z.string().trim().regex(/^\+?\d{7,15}$/, 'Invalid phone number');
const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'Must be a valid http(s) URL');

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

const idParam = z.object({ id: objectId });

const pageQuery = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');
const searchText = z.string().trim().min(1).max(100);

module.exports = { z, objectId, email, phone, httpUrl, password, idParam, pageQuery, boolQuery, searchText };
