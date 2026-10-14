const faq = require('./faq.intent');
const productSearch = require('./product-search.intent');
const orderStatus = require('./order-status.intent');
const recommendation = require('./recommendation.intent');
const support = require('./support.intent');

// Order matters: first match wins. SUPPORT is first so "I want to complain about my order" reaches a human
// instead of being answered by the order-status intent (it contains the word "order").
const INTENTS = [
  { name: 'SUPPORT', ...support },
  { name: 'ORDER_STATUS', ...orderStatus },
  { name: 'PRODUCT_SEARCH', ...productSearch },
  { name: 'RECOMMENDATION', ...recommendation },
  { name: 'FAQ', ...faq },
];

const detect = (text) => {
  const normalized = (text || '').toLowerCase();
  for (const intent of INTENTS) {
    const isMatch =
      typeof intent.match === 'function'
        ? intent.match(normalized)
        : new RegExp(intent.match.source, intent.match.flags.replace('g', '')).test(normalized);
    if (isMatch) return intent;
  }
  return null;
};

module.exports = { detect, INTENTS };