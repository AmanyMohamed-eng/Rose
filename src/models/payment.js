const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,       
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    provider: {
      type: String,
      required: true,
      enum: ['STRIPE', 'PAYMOB', 'FAWRY', 'COD'],
    },
    method: {
      type: String,
      required: true,
      enum: ['CARD', 'WALLET', 'FAWRY_REF', 'CASH'],
    },

    providerIntentId: { type: String, index: true }, 
    providerChargeId: { type: String },             
    providerCustomerId: { type: String }, 
    clientSecret: { type: String, select: false },   

    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'EGP', uppercase: true },
    refundedAmount: { type: Number, default: 0, min: 0 },

    status: {
      type: String,
      required: true,
      enum: [
        'CREATED',      
        'REQUIRES_ACTION', 
        'PROCESSING',    
        'SUCCEEDED',    
        'FAILED',
        'CANCELLED',
        'PARTIALLY_REFUNDED',
        'REFUNDED',
      ],
      default: 'CREATED',
      index: true,
    },

    failureReason: { type: String, maxlength: 300 },
    metadata: { type: mongoose.Schema.Types.Mixed }, 

    processedEventIds: { type: [String], default: [] },

    paidAt: { type: Date },
    refundedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        delete ret.clientSecret;
        delete ret.metadata; 
        return ret;
      },
    },
  }
);

paymentSchema.index({ customer: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

paymentSchema.virtual('netAmount').get(function () {
  return this.amount - this.refundedAmount;
});

module.exports = mongoose.model('Payment', paymentSchema);