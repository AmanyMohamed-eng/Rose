const Product = require('../../../models/Product');
const { toPublic } = require('../../products/product.service');

const OCCASION_TAGS = {
  birthday: ['birthday'],
  anniversary: ['anniversary', 'romantic'],
  wedding: ['wedding'],
  sympathy: ['sympathy', 'condolence'],
  valentine: ['valentine', 'romantic'],
  'عيد ميلاد': ['birthday'],
  'زفاف': ['wedding'],
  'حزن': ['sympathy'],
};

module.exports = {
  match: /(recommend|suggest|gift|occasion|birthday|anniversary|wedding|اقترح|هدية)/i,
  async handle({ text }) {
    const normalized = text.toLowerCase();
    let tags = [];
    for (const [key, values] of Object.entries(OCCASION_TAGS)) {
      if (normalized.includes(key)) tags = tags.concat(values);
    }

    const query = {
      isActive: true,
      approvalStatus: { $nin: ['PENDING', 'REJECTED'] },
    };
    if (tags.length) query.tags = { $in: tags };

    const products = await Product.find(query)
      .sort({ isFeatured: -1, ratingsAverage: -1 })
      .limit(5)
      .select('title slug price discountPrice images ratingsAverage stockQuantity reservedQuantity');

    return {
      body: tags.length
        ? `Here are some great picks for that occasion:`
        : `Here are our most-loved arrangements:`,
      payload: { products: products.map(toPublic) },
      confidence: tags.length ? 0.9 : 0.75,
    };
  },
};