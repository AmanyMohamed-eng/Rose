const mongoose = require('mongoose');
const { INVENTORY_TYPES, INVENTORY_UNITS, LOW_STOCK_THRESHOLD } = require('../constants');

const inventoryItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    type: { type: String, required: true, enum: INVENTORY_TYPES },
    unit: { type: String, default: 'stems', enum: INVENTORY_UNITS },
    quantity: { type: Number, required: true, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: LOW_STOCK_THRESHOLD, min: 0 },
    costPerUnit: { type: Number, default: 0, min: 0 },
    supplier: { type: String, trim: true, maxlength: 120 },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (d, r) => (delete r.__v, r) },
  }
);

inventoryItemSchema.index({ type: 1, isActive: 1 });

inventoryItemSchema.virtual('isLowStock').get(function isLowStock() {
  return this.quantity > 0 && this.quantity <= this.lowStockThreshold;
});
inventoryItemSchema.virtual('isOutOfStock').get(function isOutOfStock() {
  return this.quantity <= 0;
});

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
