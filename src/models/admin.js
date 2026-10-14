const mongoose = require('mongoose');

const adminProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    department: {
      type: String,
      enum: ['OWNER', 'OPERATIONS', 'FINANCE', 'SUPPORT', 'MARKETING'],
      default: 'OWNER',
    },
    title: { type: String, trim: true, maxlength: 80 }, // "Operations Manager"
    bio: { type: String, maxlength: 500 },
    avatar: { type: String },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?\d{7,15}$/, 'Please provide a valid phone number'],
    },

    permissions: {
      type: [String],
      enum: [
        'MANAGE_USERS',
        'MANAGE_PRODUCTS',
        'MANAGE_CATEGORIES',
        'MANAGE_ORDERS',
        'MANAGE_REVIEWS',
        'MANAGE_FLORISTS',
        'VIEW_FINANCIALS',
        'MANAGE_COUPONS',
        'VIEW_LOGS',
      ],
      default: [],
    },

    notifyOnLowStock: { type: Boolean, default: true },
    notifyOnNewOrder: { type: Boolean, default: true },
    notifyOnNegativeReview: { type: Boolean, default: true },

    isOwner: { type: Boolean, default: false }, 
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

adminProfileSchema.index({ department: 1, isOwner: 1 });

adminProfileSchema.methods.can = function (permission) {
  if (this.isOwner) return true;
  return this.permissions.includes(permission);
};

module.exports = mongoose.model('AdminProfile', adminProfileSchema);