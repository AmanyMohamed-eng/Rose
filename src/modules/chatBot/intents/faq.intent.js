const FAQS = [
  {
    pattern: /(delivery|deliver|شحن|توصيل).*(time|when|متى|وقت)/i,
    answer:
      'We deliver in four slots: 9am–12pm, 12pm–3pm, 3pm–6pm, and 6pm–9pm. You pick the slot at checkout.',
  },
  {
    pattern: /(payment|pay|دفع|فيزا|cash)/i,
    answer:
      'We accept Online Card payments and Cash on Delivery. You choose at checkout.',
  },
  {
    pattern: /(return|refund|استرجاع|استرداد)/i,
    answer:
      'Because flowers are perishable, we don\'t accept returns after delivery. If something arrives damaged, contact support within 2 hours and we\'ll make it right.',
  },
  {
    pattern: /(cancel|إلغاء)/i,
    answer:
      'You can cancel any order before it enters preparation. After that, please contact our team.',
  },
  {
    pattern: /(fresh|how long|يكفي|يفضل)/i,
    answer:
      'Our bouquets stay fresh 5–7 days with proper care: trim the stems at an angle, change the water daily, and keep them away from direct sunlight.',
  },
];

module.exports = {
  match: /(how|what|when|where|faq|سؤال|كيف|امتى|فيي|ايه)/i,
  async handle({ text }) {
    for (const faq of FAQS) {
      if (faq.pattern.test(text)) {
        return { body: faq.answer, payload: { faq: true }, confidence: 0.85 };
      }
    }
    return null;
  },
};