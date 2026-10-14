const express = require('express');
const router = express.Router();

const controller = require('./chatbot.controller');
const validate = require('../../middleware/validate.middleware');
const v = require('./chatbot.validator');
const authMiddleware = require('../../middleware/auth.middleware');
const { allowRoles } = require('../../middleware/role.middleware');
const { userLimiter } = require('../../middleware/rateLimit.middleware');

// Each message may trigger a paid LLM call and/or a support hand-off: cap it per user, not per IP.
const chatbotLimiter = userLimiter({ windowMs: 60 * 1000, limit: 20, message: 'You are sending messages too fast. Please slow down.' });

router.use(authMiddleware, allowRoles('customer'));

router.post('/messages', chatbotLimiter, validate({ body: v.sendMessage }), controller.sendMessage);
router.get('/history', validate({ query: v.history }), controller.getHistory);
router.post('/close', controller.closeSession);

module.exports = router;