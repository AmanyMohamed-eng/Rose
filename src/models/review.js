const mongoose = require('mongoose');
const { REVIEW_STATUS } = require('../constants');

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 120 },
    comment: { type: String, required: true, trim: true, minlength: 3, maxlength: 1000 },
    status: { type: String, enum: REVIEW_STATUS, default: 'APPROVED', index: true },
    moderationNote: { type: String, maxlength: 300 },
    helpfulCount: { type: Number, default: 0, min: 0 },
    // Users who marked the review helpful (one vote each). Never returned.
    helpfulBy: { type: [mongoose.Schema.Types.ObjectId], default: [], select: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (d, r) => (delete r.__v, delete r.helpfulBy, r) },
  }
);

reviewSchema.index({ product: 1, customer: 1 }, { unique: true });
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
