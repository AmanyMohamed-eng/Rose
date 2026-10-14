const mongoose = require('mongoose');
const { TICKET_STATUS, TICKET_CATEGORY, TICKET_PRIORITY, ROLES } = require('../constants');

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: Object.values(ROLES), required: true },
    body: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/**
 * A support/complaint/relay thread between ONE non-admin participant (customer or florist)
 * and the Admin team. A ticket never has two non-admin participants, so
 * Customer <-> Florist communication is structurally impossible: the Admin is the only mediator.
 */
const supportTicketSchema = new mongoose.Schema(
  {
    participant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    participantRole: { type: String, enum: [ROLES.CUSTOMER, ROLES.FLORIST], required: true },
    subject: { type: String, required: true, trim: true, minlength: 3, maxlength: 150 },
    category: { type: String, enum: TICKET_CATEGORY, default: 'GENERAL' },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    status: { type: String, enum: TICKET_STATUS, default: 'OPEN', index: true },
    priority: { type: String, enum: TICKET_PRIORITY, default: 'NORMAL' },
    assignedAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    initiatedByAdmin: { type: Boolean, default: false },
    messages: {
      type: [messageSchema],
      validate: [(v) => v.length <= 200, 'A ticket cannot hold more than 200 messages'],
    },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toJSON: { virtuals: true, transform: (d, r) => (delete r.__v, r) } }
);

supportTicketSchema.index({ participant: 1, lastMessageAt: -1 });
supportTicketSchema.index({ status: 1, priority: 1, lastMessageAt: -1 });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
