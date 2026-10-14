const Order = require('../../../models/Order');

module.exports = {
  match: /(order|طلب|أوردر|where is|status|تتبع|شحن)/,
  async handle({ text, customerId }) {
    const m = text.match(/rose-\d{6}-[0-9a-f]{6}/i);

    let order;
    if (m) {
      order = await Order.findOne({
        orderNumber: m[0].toUpperCase(),
        customer: customerId,
      }).select('orderNumber status delivery.deliveryDate total');
    } else {
      order = await Order.findOne({ customer: customerId })
        .sort({ createdAt: -1 })
        .select('orderNumber status delivery.deliveryDate total');
    }

    if (!order && m) {
      return {
        body: `I couldn't find order ${m[0].toUpperCase()} on your account. Please double-check the number, or I can connect you with our team.`,
        payload: { action: 'OFFER_SUPPORT' },
        confidence: 0.9,
      };
    }

    if (!order) {
      return {
        body: "I couldn't find any orders on your account. Want me to connect you with our team?",
        payload: { action: 'OFFER_SUPPORT' },
        confidence: 0.9,
      };
    }

    const labels = {
      PLACED: 'placed and awaiting confirmation',
      CONFIRMED: 'confirmed by our team',
      PREPARING: 'being prepared by our florist',
      READY: 'ready for delivery',
      OUT_FOR_DELIVERY: 'out for delivery',
      DELIVERED: 'delivered',
      CANCELLED: 'cancelled',
    };

    return {
      body: `Your order ${order.orderNumber} is currently ${labels[order.status] || order.status.toLowerCase()}.`,
      payload: { order: order.toObject() },
      confidence: 0.95,
    };
  },
};