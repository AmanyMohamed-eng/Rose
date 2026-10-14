const { z, pageQuery } = require('../../validators/common');

const sendMessage = z.object({
  message: z.string({ message: 'message is required' }).trim().min(1, 'Message is empty').max(1000, 'Message too long (max 1000)'),
});

const history = z.object({
  ...pageQuery,
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

module.exports = { sendMessage, history };
