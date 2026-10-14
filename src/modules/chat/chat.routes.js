const express = require('express');

const router = express.Router();

const controller = require('./chat.controller');
const v = require('./chat.validator');
const validate = require('../../middleware/validate.middleware');
const authMiddleware = require('../../middleware/auth.middleware');
const { allowRoles } = require('../../middleware/role.middleware');

router.use(authMiddleware);

router.get('/conversations', validate({ query: v.listConversations }), controller.listConversations);
router.get(
  '/conversations/:conversationId/messages',
  validate({ params: v.conversationParams, query: v.messagesQuery }),
  controller.getMessages
);
router.delete('/conversations/:conversationId', validate({ params: v.conversationParams }), controller.deleteConversation);

router.get('/presence/online', allowRoles('admin'), controller.getOnlineUsers);

module.exports = router;
