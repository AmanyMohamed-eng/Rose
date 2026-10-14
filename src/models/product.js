const mongoose = require('mongoose');
const slugify = require('slugify');
const { SIZES, INVENTORY_UNITS, LOW_STOCK_THRESHOLD, PRODUCT_APPROVAL } = require('../constants');

const sizeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, enum: SIZES },
    // MODIFIER added on top of the base price (Standard = +0, Deluxe = +120 ...).
    priceModifier: { type: Number, default: 0, min: 0 },
    stemMultiplier: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const recipeLineSchema = new mongoose.Schema(
  {
    inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unit: { type: String, default: 'stems', enum: INVENTORY_UNITS },
  },
  { _id: false }
);

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    alt: { type: String, default: '' },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    shortDescription: { type: String, maxlength: 200 },
    description: { type: String, required: true },
    careInstructions: { type: String },

    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    tags: [{ type: String, trim: true, lowercase: true }],
    occasions: [{ type: String, trim: true }],

    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, default: 0, min: 0 },

    images: { type: [imageSchema], default: [] },

    stockQuantity: { type: Number, required: true, default: 0, min: 0 },
    reservedQuantity: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: LOW_STOCK_THRESHOLD, min: 0 },

    recipe: { type: [recipeLineSchema], default: [] },

    sizes: {
      type: [sizeSchema],
      default: [
        { name: 'Standard', priceModifier: 0, stemMultiplier: 1 },
        { name: 'Deluxe', priceModifier: 120, stemMultiplier: 1.5 },
        { name: 'Premium', priceModifier: 250, stemMultiplier: 2 },
      ],
    },

    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },

    // Owner florist (null = platform/admin-owned). NEVER exposed to customers.
    florist: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    // Florist-submitted products stay hidden from customers until an Admin approves them.
    approvalStatus: { type: String, enum: PRODUCT_APPROVAL, default: 'APPROVED', index: true },
    approvalNote: { type: String, maxlength: 300 },

    ratingsAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingsCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform: (d, r) => (delete r.__v, r) },
    toObject: { virtuals: true },
  }
);

productSchema.index(
  { title: 'text', description: 'text', tags: 'text', occasions: 'text' },
  { weights: { title: 5, tags: 3, description: 1 } }
);
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ isFeatured: 1, isActive: 1 });
productSchema.index({ price: 1, isActive: 1 });

productSchema.virtual('finalPrice').get(function finalPrice() {
  return this.discountPrice > 0 && this.discountPrice < this.price ? this.discountPrice : this.price;
});
productSchema.virtual('discountPercentage').get(function discountPercentage() {
  if (!this.discountPrice || this.discountPrice >= this.price) return 0;
  return Math.round(((this.price - this.discountPrice) / this.price) * 100);
});
productSchema.virtual('availableStock').get(function availableStock() {
  return Math.max(0, (this.stockQuantity || 0) - (this.reservedQuantity || 0));
});
productSchema.virtual('inStock').get(function inStock() {
  return this.availableStock > 0;
});
productSchema.virtual('isLowStock').get(function isLowStock() {
  return this.availableStock > 0 && this.availableStock <= this.lowStockThreshold;
});

productSchema.pre('validate', function productGuards() {
  if (this.title && !this.slug) {
    this.slug = slugify(this.title, { lower: true, strict: true }) || `product-${Date.now()}`;
  }
  if (this.reservedQuantity > this.stockQuantity) {
    this.invalidate('reservedQuantity', 'reservedQuantity cannot exceed stockQuantity');
  }
  if (this.discountPrice > this.price) {
    this.invalidate('discountPrice', 'discountPrice cannot exceed price');
  }
});

productSchema.pre('save', function normaliseImages() {
  if (!this.images?.length) return;
  const firstPrimary = this.images.findIndex((i) => i.isPrimary);
  const keep = firstPrimary === -1 ? 0 : firstPrimary;
  this.images.forEach((img, idx) => {
    img.isPrimary = idx === keep;
  });
});

productSchema.methods.hasSize = function hasSize(sizeName) {
  return this.sizes.some((s) => s.name === sizeName);
};

productSchema.methods.priceForSize = function priceForSize(sizeName = 'Standard') {
  const size = this.sizes.find((s) => s.name === sizeName) || this.sizes[0];
  return this.finalPrice + (size?.priceModifier || 0);
};

productSchema.methods.canFulfill = function canFulfill(qty = 1) {
  return this.availableStock >= qty;
};

productSchema.methods.scaleRecipe = function scaleRecipe(sizeName = 'Standard') {
  const size = this.sizes.find((s) => s.name === sizeName) || this.sizes[0];
  const multiplier = size?.stemMultiplier ?? 1;
  return this.recipe.map((line) => ({
    inventoryItem: line.inventoryItem,
    name: line.name,
    unit: line.unit,
    quantity: Math.ceil(line.quantity * multiplier),
  }));
};

module.exports = mongoose.model('Product', productSchema);
