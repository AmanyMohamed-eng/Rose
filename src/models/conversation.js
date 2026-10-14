const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
  
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    florist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
      index: true,
    },

    subject: {
      type: String,
      trim: true,
      maxlength: 150,
    },

    origin: {
      type: String,
      enum: ['ORDER', 'SUPPORT', 'CHATBOT_HANDOFF', 'MANUAL'],
      default: 'SUPPORT',
      index: true,
    },

    status: {
      type: String,
      enum: ['OPEN', 'RESOLVED', 'CLOSED'],
      default: 'OPEN',
      index: true,
    },

    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessagePreview: { type: String, maxlength: 120 }, 
    lastMessageAuthorSide: { type: String, enum: ['CUSTOMER', 'FLORIST', 'ADMIN'] },
    messageCount: { type: Number, default: 0, min: 0 },

    unreadCounts: {
      CUSTOMER: { type: Number, default: 0, min: 0 },
      FLORIST: { type: Number, default: 0, min: 0 },
      ADMIN: { type: Number, default: 0, min: 0 },
    },

    resolvedAt: { type: Date },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

conversationSchema.index({ customer: 1, status: 1, lastMessageAt: -1 });
conversationSchema.index({ florist: 1, status: 1, lastMessageAt: -1 });
conversationSchema.index({ order: 1, status: 1 });

conversationSchema.index(
  { order: 1, customer: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'OPEN', order: { $type: 'objectId' } },
    name: 'one_open_conversation_per_order',
  }
);

conversationSchema.methods.canBeAccessedBy = function (user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'customer' && this.customer?.toString() === user.id) return true;
  if (user.role === 'florist' && this.florist?.toString() === user.id) return true;
  return false;
};

conversationSchema.methods.sideOf = function (user) {
  if (user.role === 'admin') return 'ADMIN';
  if (user.role === 'customer') return 'CUSTOMER';
  if (user.role === 'florist') return 'FLORIST';
  return null;
};

conversationSchema.methods.applyNewMessage = function (message) {
  this.lastMessageAt = message.createdAt || new Date();
  this.lastMessagePreview = (message.body || '').slice(0, 120);
  this.lastMessageAuthorSide = message.authorSide;
  this.messageCount += 1;

  const sides = message.visibleTo || [];
  for (const side of sides) {
    if (side === message.authorSide) continue;
    if (this.unreadCounts[side] === undefined) continue;
    this.unreadCounts[side] += 1;
  }
  return this;
};

conversationSchema.methods.markSideRead = function (side) {
  if (this.unreadCounts[side] === undefined) return this;
  this.unreadCounts[side] = 0;
  return this;
};

module.exports = mongoose.model('Conversation', conversationSchema);