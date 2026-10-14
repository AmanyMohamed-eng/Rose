const { z, objectId, pageQuery } = require('../../validators/common');
const { TICKET_STATUS, TICKET_CATEGORY, TICKET_PRIORITY } = require('../../constants');

const body = z.string().trim().min(1, 'Message cannot be empty').max(2000);

const createTicket = z.object({
  subject: z.string().trim().min(3).max(150),
  category: z.enum(TICKET_CATEGORY).optional(),
  orderId: objectId.optional(),
  message: body,
});

const message = z.object({ message: body });

const myList = z.object({
  ...pageQuery,
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(TICKET_STATUS).optional(),
});

// ---- Admin ----
const adminList = z.object({
  ...pageQuery,
  status: z.enum(TICKET_STATUS).optional(),
  category: z.enum(TICKET_CATEGORY).optional(),
  priority: z.enum(TICKET_PRIORITY).optional(),
  participantId: objectId.optional(),
  participantRole: z.enum(['customer', 'florist']).optional(),
});

// Admin opens a thread TO a customer or florist (e.g. relaying a request about an order).
const adminCreate = z.object({
  participantId: objectId,
  subject: z.string().trim().min(3).max(150),
  category: z.enum(TICKET_CATEGORY).optional(),
  priority: z.enum(TICKET_PRIORITY).optional(),
  orderId: objectId.optional(),
  message: body,
});

const adminUpdate = z
  .object({ status: z.enum(TICKET_STATUS), priority: z.enum(TICKET_PRIORITY) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');

const idParams = z.object({ id: objectId });

module.exports = { createTicket, message, myList, adminList, adminCreate, adminUpdate, idParams };
