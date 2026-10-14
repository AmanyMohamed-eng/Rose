const mongoose = require('mongoose');
const { ADMIN_ACTIONS, ADMIN_TARGETS } = require('../constants');

const adminLogSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, enum: ADMIN_ACTIONS },
    targetType: { type: String, enum: ADMIN_TARGETS, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId },
    changes: {
      before: { type: mongoose.Schema.Types.Mixed },
      after: { type: mongoose.Schema.Types.Mixed },
    },
    ip: { type: String },
    userAgent: { type: String },
    note: { type: String, maxlength: 300 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // append-only
    toJSON: { transform: (d, r) => (delete r.__v, r) },
  }
);

adminLogSchema.index({ admin: 1, createdAt: -1 });
adminLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
adminLogSchema.index({ action: 1, createdAt: -1 });
// Logs are kept for one year.
adminLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });

module.exports = mongoose.model('AdminLog', adminLogSchema);
