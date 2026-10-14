const { z, objectId, httpUrl, pageQuery, boolQuery, searchText } = require('../../validators/common');
const { SIZES, PRODUCT_APPROVAL } = require('../../constants');

const text = (min, max) => z.string().trim().min(min).max(max);
const label = z.string().trim().min(1).max(40);

const recipeLine = z.object({ inventoryItem: objectId, quantity: z.number().int().min(1).max(10000) });
const image = z.object({
  url: httpUrl,
  alt: z.string().trim().max(160).optional(),
  isPrimary: z.boolean().optional(),
});
const size = z.object({
  name: z.enum(SIZES),
  priceModifier: z.number().min(0).max(1e6),
  stemMultiplier: z.number().min(1).max(10),
});

const content = {
  title: text(2, 120),
  shortDescription: text(0, 200),
  description: text(10, 5000),
  careInstructions: text(0, 2000),
  category: objectId,
  tags: z.array(label).max(20),
  occasions: z.array(label).max(20),
  images: z.array(image).max(10),
  recipe: z.array(recipeLine).max(30),
  lowStockThreshold: z.number().int().min(0).max(100000),
};
const pricing = {
  price: z.number().min(0).max(1e6),
  discountPrice: z.number().min(0).max(1e6),
  sizes: z.array(size).min(1).max(3),
};

const priceChecks = (v, ctx) => {
  if (v.discountPrice !== undefined && v.price !== undefined && v.discountPrice > v.price) {
    ctx.addIssue({ code: 'custom', path: ['discountPrice'], message: 'Discount price cannot exceed price' });
  }
  if (v.sizes && new Set(v.sizes.map((s) => s.name)).size !== v.sizes.length) {
    ctx.addIssue({ code: 'custom', path: ['sizes'], message: 'Duplicate size names' });
  }
};
const nonEmpty = (v) => Object.keys(v).length > 0;

// ---------- Admin ----------
const adminCreate = z
  .object({
    ...content,
    ...pricing,
    sizes: pricing.sizes.optional(),
    discountPrice: pricing.discountPrice.optional(),
    shortDescription: content.shortDescription.optional(),
    careInstructions: content.careInstructions.optional(),
    tags: content.tags.optional(),
    occasions: content.occasions.optional(),
    images: content.images.optional(),
    recipe: content.recipe.optional(),
    lowStockThreshold: content.lowStockThreshold.optional(),
    stockQuantity: z.number().int().min(0).max(1e6).optional(),
    isFeatured: z.boolean().optional(),
    isActive: z.boolean().optional(),
    florist: objectId.optional(),
  })
  .superRefine(priceChecks);

// Stock, sold counts, ratings and slug are NOT updatable here (separate endpoints / system-managed).
const adminUpdate = z
  .object({ ...content, ...pricing, isFeatured: z.boolean(), isActive: z.boolean(), florist: objectId.nullable() })
  .partial()
  .superRefine(priceChecks)
  .refine(nonEmpty, 'At least one field is required');

// ---------- Florist (own products only) ----------
const floristCreate = z
  .object({
    ...content,
    ...pricing,
    sizes: pricing.sizes.optional(),
    discountPrice: pricing.discountPrice.optional(),
    shortDescription: content.shortDescription.optional(),
    careInstructions: content.careInstructions.optional(),
    tags: content.tags.optional(),
    occasions: content.occasions.optional(),
    images: content.images.optional(),
    recipe: content.recipe.optional(),
    lowStockThreshold: content.lowStockThreshold.optional(),
    stockQuantity: z.number().int().min(0).max(1e6).optional(),
  })
  .superRefine(priceChecks);

const floristUpdate = z
  .object({ ...content, ...pricing })
  .partial()
  .superRefine(priceChecks)
  .refine(nonEmpty, 'At least one field is required');

// ---------- Shared ----------
const setStock = z.object({ quantity: z.number().int().min(0).max(1e6) });
const approval = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().trim().max(300).optional(),
});

const publicList = z
  .object({
    ...pageQuery,
    limit: z.coerce.number().int().min(1).max(50).default(12),
    category: objectId.optional(),
    featured: boolQuery.optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    inStock: boolQuery.optional(),
    tag: label.optional(),
    occasion: label.optional(),
    search: searchText.optional(),
    sort: z.enum(['price_asc', 'price_desc', 'newest', 'popular', 'rating']).optional(),
  })
  .refine((v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice, 'minPrice cannot exceed maxPrice');

const adminList = z.object({
  ...pageQuery,
  category: objectId.optional(),
  florist: objectId.optional(),
  approvalStatus: z.enum(PRODUCT_APPROVAL).optional(),
  isActive: boolQuery.optional(),
  search: searchText.optional(),
});

const floristList = z.object({
  ...pageQuery,
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: objectId.optional(),
  search: searchText.optional(),
});

const idParams = z.object({ id: objectId });
const productIdParams = z.object({ productId: objectId });
const slugParams = z.object({ slug: z.string().trim().toLowerCase().min(1).max(160) });

module.exports = {
  adminCreate, adminUpdate, floristCreate, floristUpdate, setStock, approval,
  publicList, adminList, floristList, idParams, productIdParams, slugParams,
};
