const mongoose = require('mongoose');
const slugify = require('slugify');

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true, 
      maxlength: 60,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
      required: true, 
    },
    description: { type: String, maxlength: 300 },
    image: { type: String },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

categorySchema.index({ isActive: 1, displayOrder: 1 });
categorySchema.index({ parent: 1, isActive: 1 });

categorySchema.pre('validate', function (next) {
  if (this.name && !this.slug) {
    const base = slugify(this.name, { lower: true, strict: true }) || 'category';
    this.slug = base;
  }
  next();
});

module.exports = mongoose.model('Category', categorySchema);