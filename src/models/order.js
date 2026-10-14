const crypto = require('crypto');
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const {
  ORDER_STATUS, ORDER_TRANSITIONS, CUSTOMER_CANCELLABLE, SIZES, DELIVERY_SLOTS,
  PAYMENT_METHODS, PAYMENT_STATUS, DISCOUNT_TYPES, INVENTORY_UNITS,
} = require('../constants');

const STATUSES = Object.values(ORDER_STATUS);

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    // ---- Snapshots (immune to product edits) ----
    title: { type: String, required: true },
    slug: { type: String, required: true },
    image: { type: String },
    // ---- Customizer choices ----
    size: { type: String, enum: SIZES, default: 'Standard' },
    cardMessage: { type: String, maxlength: 300 },
    wrappingNote: { type: String, maxlength: 300 },
    // ---- Pricing snapshot ----
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
    // ---- Recipe snapshot (per ONE unit, already scaled to size) ----
    recipe: [
      {
        _id: false,
        inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' },
        name: String,
        unit: { type: String, enum: INVENTORY_UNITS },
        quantity: { type: Number, min: 1 },
      },
    ],
  },
  { _id: true }
);

const deliverySchema = new mongoose.Schema(
  {
    recipientName: { type: String, required: true, trim: true },
    recipientPhone: { type: String, required: true, match: [/^\+?\d{7,15}$/, 'Invalid phone number'] },
    addressLine1: { type: String, required: true, trim: true },
    addressLine2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    postalCode: { type: String, trim: true },
    country: { type: String, default: 'EG', trim: true },
    deliveryDate: { type: Date, required: true },
    slot: { type: String, required: true, enum: DELIVERY_SLOTS },
    notes: { type: String, maxlength: 300 },
    deliveredAt: { type: Date },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    note: { type: String, maxlength: 200 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: {
      type: [orderItemSchema],
      validate: [(v) => v.length > 0, 'Order must contain at least one item'],
    },

    // ---- Financials ----
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    coupon: {
      couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
      code: { type: String, uppercase: true, trim: true },
      type: { type: String, enum: DISCOUNT_TYPES },
      value: { type: Number, min: 0 },
    },
    deliveryFee: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },

    // ---- Payment ----
    paymentMethod: { type: String, required: true, enum: PAYMENT_METHODS },
    paymentStatus: { type: String, enum: PAYMENT_STATUS, default: 'PENDING' },
    paidAt: { type: Date },
    transactionRef: { type: String, maxlength: 100 },

    delivery: { type: deliverySchema, required: true },

    // ---- Fulfilment ----
    status: { type: String, enum: STATUSES, default: 'PLACED', index: true },
    statusHistory: { type: [statusHistorySchema], default: [] },

    assignedFlorist: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    assignedAt: { type: Date },

    isReviewed: { type: Boolean, default: false },

    cancelledAt: { type: Date },
    cancellationReason: { type: String, maxlength: 300 },
  },
  {
    timestamps: true,
    // Concurrent modifications (e.g. two admins confirming the same order) fail with a VersionError
    // instead of silently overwriting each other.
    optimisticConcurrency: true,
    toJSON: { virtuals: true, transform: (d, r) => (delete r.__v, r) },
    toObject: { virtuals: true },
  }
);

orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ assignedFlorist: 1, status: 1 });
orderSchema.index({ 'delivery.deliveryDate': 1 });

orderSchema.virtual('itemCount').get(function itemCount() {
  return (this.items || []).reduce((sum, i) => sum + i.quantity, 0);
});
orderSchema.virtual('isCancellable').get(function isCancellable() {
  return CUSTOMER_CANCELLABLE.includes(this.status);
});
orderSchema.virtual('isTerminal').get(function isTerminal() {
  return ['DELIVERED', 'CANCELLED'].includes(this.status);
});

orderSchema.statics.generateOrderNumber = function generateOrderNumber() {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(-2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `ROSE-${ymd}-${rand}`;
};

orderSchema.pre('validate', function setOrderNumber() {
  if (!this.orderNumber) this.orderNumber = this.constructor.generateOrderNumber();
});

orderSchema.pre('save', function initialHistory() {
  if (this.isNew && this.statusHistory.length === 0) {
    this.statusHistory.push({ status: this.status, note: 'Order created' });
  }
});

/** Pure in-memory state change; throws 409 on an illegal transition BEFORE any side effect runs. */
orderSchema.methods.transitionTo = function transitionTo(nextStatus, actorId, note) {
  const allowed = ORDER_TRANSITIONS[this.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new AppError(`Cannot transition from ${this.status} to ${nextStatus}`, 409);
  }
  this.status = nextStatus;
  this.statusHistory.push({ status: nextStatus, changedBy: actorId, note });

  if (nextStatus === 'DELIVERED') {
    this.delivery.deliveredAt = new Date();
    if (this.paymentMethod === 'COD') {
      this.paymentStatus = 'PAID';
      this.paidAt = new Date();
    }
  }
  if (nextStatus === 'CANCELLED') this.cancelledAt = new Date();
  return this;
};

module.exports = mongoose.model('Order', orderSchema);
