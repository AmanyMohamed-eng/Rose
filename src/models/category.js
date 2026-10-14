const mongoose = require('mongoose');
const slugify = require('slugify');

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 100 },
    slug: { type: String, unique: true, lowercase: true, required: true },
    description: { type: String, maxlength: 300 },
    image: { type: String },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { transform: (d, r) => (delete r.__v, r) } }
);

categorySchema.index({ isActive: 1, displayOrder: 1 });
categorySchema.index({ parent: 1, isActive: 1 });

categorySchema.pre('validate', function setSlug() {
  if (this.name && !this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true }) || 'category';
  }
});

module.exports = mongoose.model('Category', categorySchema);
