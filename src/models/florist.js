const mongoose = require('mongoose');

const floristProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    bio: { type: String, maxlength: 500 },
    specialties: [{ type: String, trim: true }], // "Roses", "Weddings", "Sympathy"
    yearsExperience: { type: Number, min: 0, default: 0 },
    shiftStart: { type: String, match: /^\d{2}:\d{2}$/, default: '09:00' },
    shiftEnd: { type: String, match: /^\d{2}:\d{2}$/, default: '18:00' },
    isAvailable: { type: Boolean, default: true },
    avatar: { type: String },
  },
  { timestamps: true, toJSON: { transform: (d, r) => (delete r.__v, r) } }
);

module.exports = mongoose.model('FloristProfile', floristProfileSchema);