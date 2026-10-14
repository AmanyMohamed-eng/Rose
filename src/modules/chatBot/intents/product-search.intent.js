const Product = require('../../../models/Product');
const { toPublic } = require('../../products/product.service');

const STOP_WORDS = new Set([
  'show', 'find', 'search', 'me', 'for', 'looking', 'i', 'want', 'need', 'please', 'a', 'an', 'the', 'some', 'to', 'can', 'you',
]);

module.exports = {
  match: /(show|find|search|looking for|عايز|ابحث|فيه)/,
  async handle({ text }) {
    const q = text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w && !STOP_WORDS.has(w.replace(/[^\p{L}\p{N}-]/gu, '')))
      .join(' ')
      .trim();

    if (q.length < 2) {
      return {
        body: 'What kind of flowers are you looking for? Try "red roses", "tulips", or "birthday bouquet".',
        confidence: 0.6,
      };
    }

    const products = await Product.find({
      isActive: true,
      approvalStatus: { $nin: ['PENDING', 'REJECTED'] },
      $text: { $search: q },
    })
      .limit(5)
      .select('title slug price discountPrice images ratingsAverage stockQuantity reservedQuantity');

    if (!products.length) {
      return {
        body: `I couldn't find anything matching "${q}". Would you like to see our featured picks?`,
        payload: { action: 'SHOW_FEATURED' },
        confidence: 0.7,
      };
    }

    return {
      body: `Here are ${products.length} matches for "${q}":`,
      payload: { products: products.map(toPublic) },
      confidence: 0.9,
    };
  },
};