const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    // ---- Snapshots (immune to product edits) ----
    title: { type: String, required: true },
    slug: { type: String, required: true },
    image: { type: String },

    // ---- Customizer choices ----
    size: {
      type: String,
      enum: ['Standard', 'Deluxe', 'Premium'],
      default: 'Standard',
    },
    cardMessage: { type: String, maxlength: 300 },
    wrappingNote: { type: String, maxlength: 300 },

    // ---- Pricing snapshot ----
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    lineTotal: { type: Number, required: true, min: 0 },

    // ---- Recipe snapshot (already scaled to size) ----
    recipe: [
      {
        inventoryItem: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'InventoryItem',
        },
        name: String,
        unit: String,
        quantity: { type: Number, min: 1 },
      },
    ],
  },
  { _id: true }
);

const deliverySchema = new mongoose.Schema(
  {
    recipientName: { type: String, required: true, trim: true },
    recipientPhone: {
      type: String,
      required: true,
      match: [/^\+?\d{7,15}$/, 'Invalid phone number'],
    },
    addressLine1: { type: String, required: true, trim: true },
    addressLine2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    postalCode: { type: String, trim: true },
    country: { type: String, default: 'EG', trim: true },

    deliveryDate: { type: Date, required: true },
    slot: {
      type: String,
      required: true,
      enum: ['09:00-12:00', '12:00-15:00', '15:00-18:00', '18:00-21:00'],
    },

    notes: { type: String, maxlength: 300 },
    deliveredAt: { type: Date },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: [
        'PLACED',
        'CONFIRMED',
        'PREPARING',
        'READY',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'CANCELLED',
      ],
      required: true,
    },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    note: { type: String, maxlength: 200 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      index: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    items: {
      type: [orderItemSchema],
      validate: [(v) => v.length > 0, 'Order must contain at least one item'],
    },

    // ---- Financials ----
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    coupon: {
      code: { type: String, uppercase: true, trim: true },
      type: { type: String, enum: ['PERCENT', 'FIXED'] },
      value: { type: Number, min: 0 },
    },
    deliveryFee: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },

    // ---- Payment ----
    paymentMethod: {
      type: String,
      required: true,
      enum: ['COD', 'ONLINE'],
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
      default: 'PENDING',
    },
    paidAt: { type: Date },
    transactionRef: { type: String },

    // ---- Delivery ----
    delivery: { type: deliverySchema, required: true },

    // ---- Fulfillment ----
    status: {
      type: String,
      enum: [
        'PLACED',
        'CONFIRMED',
        'PREPARING',
        'READY',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'CANCELLED',
      ],
      default: 'PLACED',
      index: true,
    },
    statusHistory: { type: [statusHistorySchema], default: [] },

    assignedFlorist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    assignedAt: { type: Date },

    // ---- Review ----
    isReviewed: { type: Boolean, default: false },

    // ---- Cancellation ----
    cancelledAt: { type: Date },
    cancellationReason: { type: String, maxlength: 300 },
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
    toObject: { virtuals: true },
  }
);

// ---------- Indexes ----------
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ assignedFlorist: 1, status: 1 });
orderSchema.index({ 'delivery.deliveryDate': 1 });

// ---------- Virtuals ----------
orderSchema.virtual('itemCount').get(function () {
  return this.items.reduce((sum, i) => sum + i.quantity, 0);
});

orderSchema.virtual('isCancellable').get(function () {
  return ['PLACED', 'CONFIRMED'].includes(this.status);
});

orderSchema.virtual('isTerminal').get(function () {
  return ['DELIVERED', 'CANCELLED'].includes(this.status);
});

// ---------- Hooks ----------
orderSchema.pre('validate', function (next) {
  if (!this.orderNumber) {
    const d = new Date();
    const ymd = `${d.getFullYear().toString().slice(-2)}${String(
      d.getMonth() + 1
    ).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    this.orderNumber = `ROSE-${ymd}-${rand}`;
  }
  next();
});

orderSchema.pre('save', function (next) {
  if (this.isNew && this.statusHistory.length === 0) {
    this.statusHistory.push({ status: this.status, note: 'Order created' });
  }
  next();
});

// ---------- Status machine ----------
const ALLOWED_TRANSITIONS = {
  PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

orderSchema.methods.transitionTo = function (nextStatus, actorId, note) {
  const allowed = ALLOWED_TRANSITIONS[this.status] || [];
  if (!allowed.includes(nextStatus)) {
    const err = new Error(`Cannot transition from ${this.status} to ${nextStatus}`);
    err.statusCode = 409;
    err.isOperational = true;
    throw err;
  }

  this.status = nextStatus;
  this.statusHistory.push({ status: nextStatus, changedBy: actorId, note });

  if (nextStatus === 'DELIVERED') {
    this.delivery.deliveredAt = new Date();
    if (this.paymentMethod === 'COD') this.paymentStatus = 'PAID';
  }
  if (nextStatus === 'CANCELLED') this.cancelledAt = new Date();

  return this;
};

module.exports = mongoose.model('Order', orderSchema);