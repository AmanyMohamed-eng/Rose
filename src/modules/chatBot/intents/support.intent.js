const Conversation = require('../../../models/Conversation');
const Message = require('../../../models/Message');

module.exports = {
  match: /(human|agent|support|complain|شكوى|موظف|بشري|مساعده)/i,
  async handle({ customerId, text }) {
    // Reuse only an open *handoff* conversation — never an order conversation the customer happens to have open.
    let conv = await Conversation.findOne({ customer: customerId, status: 'OPEN', origin: 'CHATBOT_HANDOFF' });
    if (!conv) {
      conv = await Conversation.create({
        customer: customerId,
        subject: 'Customer support request',
        origin: 'CHATBOT_HANDOFF',
      });
    }

    // The agent must actually see what the customer said — previously it was only returned in the bot payload
    // and the new conversation was empty.
    const message = await Message.create({
      conversation: conv._id,
      author: customerId,
      authorSide: 'CUSTOMER',
      body: String(text).trim().slice(0, 2000),
      visibleTo: ['CUSTOMER', 'ADMIN'],
    });
    conv.applyNewMessage(message);
    await conv.save();

    return {
      body: "I've alerted our support team. A team member will reply in your chat shortly.",
      payload: {
        action: 'HANDOFF',
        conversationId: conv._id,
        initialMessage: text,
      },
      confidence: 0.95,
    };
  },
};
