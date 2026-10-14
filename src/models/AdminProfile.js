const mongoose = require('mongoose');

const adminProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    department: {
      type: String,
      enum: ['OWNER', 'OPERATIONS', 'FINANCE', 'SUPPORT', 'MARKETING'],
      default: 'OPERATIONS',
    },
    title: { type: String, trim: true, maxlength: 80 },
    bio: { type: String, maxlength: 500 },
    avatar: { type: String },
    phone: { type: String, trim: true, match: [/^\+?\d{7,15}$/, 'Please provide a valid phone number'] },

    notifyOnLowStock: { type: Boolean, default: true },
    notifyOnNewOrder: { type: Boolean, default: true },
    notifyOnNegativeReview: { type: Boolean, default: true },

    // The owner cannot be blocked or demoted by other admins.
    isOwner: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, toJSON: { transform: (d, r) => (delete r.__v, r) } }
);

module.exports = mongoose.model('AdminProfile', adminProfileSchema);
