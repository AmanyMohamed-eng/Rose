const mongoose = require('mongoose');
const slugify = require('slugify');

const sizeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      enum: ['Standard', 'Deluxe', 'Premium'],
    },
    // NOTE: this is a MODIFIER added on top of the base price.
    // Standard = +0, Deluxe = +120, Premium = +250, etc.
    priceModifier: { type: Number, default: 0, min: 0 },
    stemMultiplier: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const recipeLineSchema = new mongoose.Schema(
  {
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryItem',
      required: true,
    },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unit: {
      type: String,
      default: 'stems',
      enum: ['stems', 'units', 'meters', 'sheets'],
    },
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
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },

    shortDescription: { type: String, maxlength: 200 },
    description: { type: String, required: true },
    careInstructions: { type: String },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    tags: [{ type: String, trim: true, lowercase: true }],
    occasions: [{ type: String, trim: true }],

    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, default: 0, min: 0 },

    images: { type: [imageSchema], default: [] },

    stockQuantity: { type: Number, required: true, default: 0, min: 0 },
    reservedQuantity: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },

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

    ratingsAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingsCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
// Only ONE text index is allowed per collection — consolidate.
productSchema.index(
  { title: 'text', description: 'text', tags: 'text', occasions: 'text' },
  { weights: { title: 5, tags: 3, description: 1 } }
);
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ isFeatured: 1, isActive: 1 });
productSchema.index({ price: 1, isActive: 1 });

// ---------- Virtuals ----------
productSchema.virtual('finalPrice').get(function () {
  return this.discountPrice > 0 && this.discountPrice < this.price
    ? this.discountPrice
    : this.price;
});

productSchema.virtual('discountPercentage').get(function () {
  if (!this.discountPrice || this.discountPrice >= this.price) return 0;
  return Math.round(((this.price - this.discountPrice) / this.price) * 100);
});

productSchema.virtual('availableStock').get(function () {
  return Math.max(0, this.stockQuantity - this.reservedQuantity);
});

productSchema.virtual('inStock').get(function () {
  return this.availableStock > 0;
});

productSchema.virtual('isLowStock').get(function () {
  return this.availableStock > 0 && this.availableStock <= this.lowStockThreshold;
});

// ---------- Hooks ----------
productSchema.pre('validate', function (next) {
  // Slug: fixed after creation (SEO-stable URLs).
  // If you want slugs to update on rename, uncomment the else branch and
  // store previous slugs for redirects.
  if (this.title && !this.slug) {
    this.slug = slugify(this.title, { lower: true, strict: true }) || `product-${Date.now()}`;
  }
  // else if (this.isModified('title')) {
  //   this.slug = slugify(this.title, { lower: true, strict: true });
  // }

  // Guard: reserved can never exceed stock
  if (this.reservedQuantity > this.stockQuantity) {
    return next(new Error('reservedQuantity cannot exceed stockQuantity'));
  }

  // Guard: discount cannot exceed price
  if (this.discountPrice > this.price) {
    return next(new Error('discountPrice cannot exceed price'));
  }

  next();
});

productSchema.pre('save', function (next) {
  if (!this.images?.length) return next();
  const firstPrimaryIdx = this.images.findIndex((i) => i.isPrimary);
  const keepIdx = firstPrimaryIdx === -1 ? 0 : firstPrimaryIdx;
  this.images.forEach((img, idx) => {
    img.isPrimary = idx === keepIdx;
  });
  next();
});

// ---------- Methods ----------

productSchema.methods.priceForSize = function (sizeName = 'Standard') {
  const size = this.sizes.find((s) => s.name === sizeName) || this.sizes[0];
  return this.finalPrice + (size?.priceModifier || 0);
};

productSchema.methods.canFulfill = function (qty = 1) {
  return this.availableStock >= qty;
};

productSchema.methods.scaleRecipe = function (sizeName = 'Standard') {
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