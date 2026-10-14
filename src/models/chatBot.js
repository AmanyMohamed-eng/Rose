const mongoose = require('mongoose');

const SENDER = ['USER', 'BOT', 'HUMAN'];

const chatbotMessageSchema = new mongoose.Schema(
  {
    sender: { type: String, enum: SENDER, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
    body: { type: String, required: true, maxlength: 4000 },
    intent: { type: String },
    payload: { type: mongoose.Schema.Types.Mixed }, 
    confidence: { type: Number, min: 0, max: 1 },
  },
  { timestamps: true, _id: true }
);

const chatbotSessionSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'HANDED_OFF', 'CLOSED'],
      default: 'ACTIVE',
      index: true,
    },
    handedOffTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    linkedConversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
    },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    messages: { type: [chatbotMessageSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: { transform: (d, r) => (delete r.__v, r) },
  }
);

chatbotSessionSchema.index({ customer: 1, status: 1, lastMessageAt: -1 });

module.exports = mongoose.model('ChatbotSession', chatbotSessionSchema);