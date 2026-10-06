const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 80,
    },
    type: {
      type: String,
      required: true,
      enum: ['STEM', 'WRAPPING', 'RIBBON', 'PACKAGING', 'OTHER'],
    },
    unit: {
      type: String,
      default: 'stems',
      enum: ['stems', 'units', 'meters', 'sheets'],
    },
    quantity: { type: Number, required: true, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 20, min: 0 },
    costPerUnit: { type: Number, default: 0, min: 0 }, // feeds COGS
    supplier: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
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
  }
);

inventoryItemSchema.index({ type: 1, isActive: 1 });
inventoryItemSchema.index({ quantity: 1, lowStockThreshold: 1 });

inventoryItemSchema.virtual('isLowStock').get(function () {
  return this.quantity > 0 && this.quantity <= this.lowStockThreshold;
});

inventoryItemSchema.virtual('isOutOfStock').get(function () {
  return this.quantity <= 0;
});

inventoryItemSchema.methods.applyDelta = async function (delta) {
  if (this.quantity + delta < 0) {
    const err = new Error(`Insufficient inventory for ${this.name}`);
    err.statusCode = 409;
    err.isOperational = true;
    throw err;
  }
  this.quantity += delta;
  await this.save();
  return this;
};

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);