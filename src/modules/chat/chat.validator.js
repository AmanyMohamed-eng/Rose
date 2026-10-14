const { z, objectId, pageQuery } = require('../../validators/common');

const conversationParams = z.object({ conversationId: objectId });

const listConversations = z.object({
  ...pageQuery,
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['OPEN', 'RESOLVED', 'CLOSED']).optional(),
});

const messagesQuery = z.object({
  ...pageQuery,
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

module.exports = { conversationParams, listConversations, messagesQuery };
