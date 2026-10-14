const mongoose = require('mongoose');
const { FLORIST_STATUS } = require('../constants');

const documentSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 80 },
    url: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { _id: false }
);

const verificationSchema = new mongoose.Schema(
  {
    businessName: { type: String, trim: true, maxlength: 120 },
    licenseNumber: { type: String, trim: true, maxlength: 60 },
    nationalId: { type: String, trim: true, maxlength: 30 },
    businessAddress: { type: String, trim: true, maxlength: 250 },
    documents: { type: [documentSchema], default: [] },
    submittedAt: { type: Date },
  },
  { _id: false }
);

const floristProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    bio: { type: String, maxlength: 500 },
    specialties: [{ type: String, trim: true, maxlength: 40 }],
    yearsExperience: { type: Number, min: 0, default: 0 },
    shiftStart: { type: String, match: /^\d{2}:\d{2}$/, default: '09:00' },
    shiftEnd: { type: String, match: /^\d{2}:\d{2}$/, default: '18:00' },
    isAvailable: { type: Boolean, default: true },
    avatar: { type: String },

    // ---- Admin approval ----
    approvalStatus: {
      type: String,
      enum: Object.values(FLORIST_STATUS),
      default: FLORIST_STATUS.PENDING,
      index: true,
    },
    verification: { type: verificationSchema, default: () => ({}) },
    rejectionReason: { type: String, maxlength: 300 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true, toJSON: { transform: (d, r) => (delete r.__v, r) } }
);

module.exports = mongoose.model('FloristProfile', floristProfileSchema);
