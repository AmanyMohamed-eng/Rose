const ChatbotSession = require('../../models/ChatbotSession');
const intents = require('./intents');
const llm = require('./providers/llm.provider');
const AppError = require('../../utils/AppError');

const DEFAULT_REPLY =
  "I'm not sure I understood that. I can help with orders, delivery, product recommendations, or connect you with our team.";

const getOrCreateSession = async (customerId) => {
  let session = await ChatbotSession.findOne({ customer: customerId, status: 'ACTIVE' });
  if (!session) {
    try {
      session = await ChatbotSession.create({ customer: customerId });
    } catch (err) {
      if (err.code !== 11000) throw err; // a concurrent request created the active session first
      session = await ChatbotSession.findOne({ customer: customerId, status: 'ACTIVE' });
    }
  }
  return session;
};

const getSessionHistory = async (customerId, page = 1, limit = 50) => {
  const session = await ChatbotSession.findOne({ customer: customerId }).sort({
    lastMessageAt: -1,
  });
  if (!session) return { session: null, messages: [], pagination: { total: 0, page, limit, pages: 0 } };

  const total = session.messages.length;
  const start = Math.max(0, total - page * limit);
  const end = Math.max(0, total - (page - 1) * limit);
  const messages = session.messages.slice(start, end);

  return {
    session: { _id: session._id, status: session.status, lastMessageAt: session.lastMessageAt },
    messages,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  };
};

const sendMessage = async (customerId, text) => {
  if (typeof text !== 'string' || !text.trim()) throw new AppError('Message is empty', 400);
  if (text.length > 1000) throw new AppError('Message too long (max 1000)', 400);

  const session = await getOrCreateSession(customerId);
  if (session.status !== 'ACTIVE') {
    throw new AppError('Session is not active', 409);
  }

  session.messages.push({ sender: 'USER', author: customerId, body: text.trim() });

  let reply = null;
  let intent = intents.detect(text);

  if (intent) {
    try {
      reply = await intent.handle({ text, customerId });
    } catch (err) {
      console.error(`[chatbot] intent ${intent.name} failed:`, err.message);
      reply = { body: 'Something went wrong on my side. Want me to connect you with our team?', payload: { action: 'OFFER_SUPPORT' }, confidence: 0.3 };
    }
  }

  if (!reply) {
    intent = null; // the matched intent had nothing to say (e.g. FAQ without a pattern) — don't mislabel the reply
    reply = await llm.ask(text);
  }

  if (!reply) {
    reply = { body: DEFAULT_REPLY, confidence: 0.2 };
  }

  session.messages.push({
    sender: 'BOT',
    body: reply.body,
    intent: intent?.name,
    payload: reply.payload,
    confidence: reply.confidence,
  });
  session.lastMessageAt = new Date();
  session.trimMessages();

  if (reply.payload?.action === 'HANDOFF') {
    session.status = 'HANDED_OFF';
    session.linkedConversation = reply.payload.conversationId;
  }

  await session.save();

  return {
    sessionId: session._id,
    status: session.status,
    reply: {
      body: reply.body,
      intent: intent?.name || (reply.confidence === 0.2 ? 'UNKNOWN' : 'LLM_FALLBACK'),
      payload: reply.payload,
      confidence: reply.confidence,
    },
  };
};

const closeSession = async (customerId) => {
  const session = await ChatbotSession.findOne({ customer: customerId, status: 'ACTIVE' });
  if (!session) throw new AppError('No active session', 404);
  session.status = 'CLOSED';
  await session.save();
  return session;
};

module.exports = { sendMessage, getSessionHistory, closeSession, getOrCreateSession };