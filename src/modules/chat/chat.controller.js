const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const presence = require('./chat.service');
const AppError = require('../../utils/AppError');
const { roleToSide, canAccessConversation } = require('./chat.socket');
const { paginationMeta, skipFor } = require('../../utils/pagination');

/**
 * GET /api/v1/chat/conversations
 */
const listConversations = async (req, res, next) => {
  try {
    const { page, limit } = req.query;

    const query = {};
    if (req.user.role === 'customer') query.customer = req.user.id;
    else if (req.user.role === 'florist') query.florist = req.user.id;

    if (req.query.status) query.status = req.query.status;

    const [convs, total] = await Promise.all([
      Conversation.find(query)
        .sort({ lastMessageAt: -1 })
        .skip(skipFor(page, limit))
        .limit(limit),
      Conversation.countDocuments(query),
    ]);

    const side = roleToSide(req.user.role);

    const enriched = await Promise.all(
      convs.map(async (c) => {
        const [last, unread] = await Promise.all([
          Message.findOne({ conversation: c._id, visibleTo: side })
            .sort({ createdAt: -1 })
            .select('body authorSide createdAt'),
          Message.countDocuments({
            conversation: c._id,
            visibleTo: side,
            authorSide: { $ne: side },
            'readBy.side': { $ne: side },
          }),
        ]);

        return {
          _id: c._id,
          order: c.order,
          subject: c.subject,
          status: c.status,
          lastMessageAt: c.lastMessageAt,
          messageCount: c.messageCount,
          lastMessage: last,
          unreadCount: unread,
        };
      })
    );

    res.status(200).json({
      success: true,
      items: enriched,
      pagination: paginationMeta(total, page, limit),
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/v1/chat/conversations/:conversationId/messages
 */
const getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { page, limit } = req.query;

    const conv = await Conversation.findById(conversationId);
    if (!conv || !canAccessConversation(conv, req.user)) {
      throw new AppError('Conversation not found', 404);
    }

    const side = roleToSide(req.user.role);
    const query = { conversation: conv._id, visibleTo: side };

    const [messages, total] = await Promise.all([
      Message.find(query)
        .sort({ createdAt: 1 })
        .skip(skipFor(page, limit))
        .limit(limit)
        .populate('author', 'name role'),
      Message.countDocuments(query),
    ]);

    // toView() strips internal fields (relayedBy / originalBody / deletedBy / visibleTo ...) for non-admin sides.
    // Returning the raw documents leaked the mediation metadata to customers and florists.
    res.status(200).json({
      success: true,
      conversationId,
      items: messages.map((m) => m.toView(side)),
      pagination: paginationMeta(total, page, limit),
    });
  } catch (e) {
    next(e);
  }
};

/**
 * DELETE /api/v1/chat/conversations/:conversationId
 */
const deleteConversation = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const conv = await Conversation.findById(conversationId);
    if (!conv || !canAccessConversation(conv, req.user)) {
      throw new AppError('Conversation not found', 404);
    }

    if (req.user.role === 'admin') {
      // Delete the messages too — otherwise they are orphaned forever.
      await Message.deleteMany({ conversation: conv._id });
      await Conversation.deleteOne({ _id: conv._id });
      return res.status(204).send();
    }

    conv.status = 'CLOSED';
    conv.closedBy = req.user.id;
    conv.closedAt = new Date();
    await conv.save();

    // Minimal view: the full document carries a preview/unread counters shared by every side.
    return res.status(200).json({
      success: true,
      message: 'Conversation closed',
      conversation: { _id: conv._id, status: conv.status, closedAt: conv.closedAt },
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/v1/chat/presence/online
 */
const getOnlineUsers = async (req, res, next) => {
  try {
    res.status(200).json({ success: true, online: presence.getOnlineUserIds() });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  listConversations,
  getMessages,
  deleteConversation,
  getOnlineUsers,
};