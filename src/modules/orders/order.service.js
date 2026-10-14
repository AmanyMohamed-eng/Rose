const Order = require('../../models/Order');
const Product = require('../../models/Product');
const User = require('../../models/User');
const FloristProfile = require('../../models/FloristProfile');
const AppError = require('../../utils/AppError');
const productService = require('../products/product.service');
const inventoryService = require('../inventory/inventory.service');
const couponService = require('../coupons/coupon.service');
const cartService = require('../cart/cart.service');
const paymentService = require('../payment/payment.service');
const serializer = require('./order.serializer');
const { paginationMeta, skipFor } = require('../../utils/pagination');
const { round2 } = require('../../utils/helpers');
const {
  DELIVERY_FEE,
  TAX_RATE,
  CUSTOMER_CANCELLABLE,
  ACTIVE_ORDER_STATUSES,
  ROLES,
  FLORIST_STATUS,
} = require('../../constants');


const RECIPE_CONSUMED_STATES = ['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const UNCANCELLABLE_STATES = ['DELIVERED', 'CANCELLED'];
const FLORIST_ALLOWED_STATUSES = ['PREPARING', 'READY'];
const VALID_PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];

const rollbackOps = async (done) => {
  for (const op of [...done].reverse()) {
    try {
      await op.undo();
    } catch (err) {
      console.error('[order] rollback step failed:', err.message);
    }
  }
};

const runOps = async (ops) => {
  const done = [];
  try {
    for (const op of ops) {
      await op.apply();
      done.push(op);
    }
  } catch (err) {
    await rollbackOps(done);
    throw err;
  }
  return done;
};

const snapshotOrder = (order) => ({
  status: order.status,
  paymentStatus: order.paymentStatus,
  statusHistoryLength: order.statusHistory?.length ?? 0,
  deliveredAt: order.delivery?.deliveredAt,
  cancelledAt: order.cancelledAt,
  paidAt: order.paidAt,
});

const restoreOrder = (order, snap) => {
  order.status = snap.status;
  order.paymentStatus = snap.paymentStatus;
  if (order.statusHistory) {
    order.statusHistory = order.statusHistory.slice(0, snap.statusHistoryLength);
  }
  if (order.delivery) order.delivery.deliveredAt = snap.deliveredAt;
  order.cancelledAt = snap.cancelledAt;
  order.paidAt = snap.paidAt;
};

const sumByProduct = (items) => {
  const m = new Map();
  for (const i of items) {
    const k = String(i.product);
    m.set(k, (m.get(k) || 0) + i.quantity);
  }
  return m;
};

const sumRecipe = (items) => {
  const m = new Map();
  for (const i of items) {
    for (const r of i.recipe || []) {
      if (!r.inventoryItem) continue;
      const k = String(r.inventoryItem);
      m.set(k, (m.get(k) || 0) + r.quantity * i.quantity);
    }
  }
  return m;
};

const P = productService;

const productOp = {
  reserve: (id, q) => ({
    apply: () => P.reserveStock(id, q),
    undo: () => P.releaseReservation(id, q),
  }),
  release: (id, q) => ({
    apply: () => P.releaseReservation(id, q),
    undo: () => P.restoreReservation(id, q),
  }),
  commit: (id, q) => ({
    apply: () => P.commitSale(id, q),
    undo: () => P.revertCommit(id, q),
  }),
  reverse: (id, q) => ({
    apply: () => P.reverseSale(id, q),
    undo: () => P.recommitSale(id, q),
  }),
};

const inventoryOp = {
  consume: (id, q) => ({
    apply: () => inventoryService.consumeStock(id, q),
    undo: () => inventoryService.restoreStock(id, q),
  }),
  restore: (id, q) => ({
    apply: () => inventoryService.restoreStock(id, q),
    undo: () => inventoryService.consumeStock(id, q),
  }),
};

const effectsFor = (order, prev, next) => {
  const ops = [];
  const products = sumByProduct(order.items);
  const recipe = sumRecipe(order.items);
  const each = (map, factory) => map.forEach((qty, id) => ops.push(factory(id, qty)));

  if (prev === 'PLACED' && next === 'CONFIRMED') {
    each(products, productOp.commit);
  }
  if (prev === 'CONFIRMED' && next === 'PREPARING') {
    each(recipe, inventoryOp.consume);
  }

  if (next === 'CANCELLED') {
    if (prev === 'PLACED') {
      each(products, productOp.release);
    } else {
      each(products, productOp.reverse);
      if (RECIPE_CONSUMED_STATES.includes(prev)) {
        each(recipe, inventoryOp.restore);
      }
    }

    const couponId = order.coupon?.couponId;
    if (couponId) {
      const customerId = order.customer?._id || order.customer;
      ops.push({
        apply: () => couponService.release(couponId, customerId),
        undo: () => couponService.reapply(couponId, customerId),
      });
    }
  }

  return ops;
};

const applyTransition = async (order, next, actorId, note) => {
  const snap = snapshotOrder(order);

  order.transitionTo(next, actorId, note);

  let done;
  try {
    done = await runOps(effectsFor(order, snap.status, next));
  } catch (err) {

    restoreOrder(order, snap);
    throw err;
  }

  try {
    await order.save();
  } catch (err) {
    await rollbackOps(done);
    restoreOrder(order, snap);
    throw err;
  }

  return order;
};

const createWithRetry = async (doc) => {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await Order.create(doc);
    } catch (err) {
      lastErr = err;
      const isDupNumber =
        err.code === 11000 &&
        (err.keyPattern?.orderNumber || /orderNumber/.test(err.message));
      if (!isDupNumber) throw err;
      // Collision on the generated orderNumber — regenerate and retry.
      doc.orderNumber = Order.generateOrderNumber();
    }
  }
  throw lastErr;
};

const createOrder = async (customerId, payload) => {
  const { items, delivery, paymentMethod, couponCode } = payload;

  const ids = [...new Set(items.map((i) => i.productId))];
  const products = await Product.find({
    _id: { $in: ids },
    isActive: true,
    approvalStatus: { $nin: ['PENDING', 'REJECTED'] },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines = items.map((item) => {
    const product = byId.get(item.productId);
    if (!product) {
      throw new AppError(`Product ${item.productId} not found or unavailable`, 404);
    }

    const size = item.size || 'Standard';
    if (!product.hasSize(size)) {
      throw new AppError(`"${product.title}" is not available in size ${size}`, 400);
    }

    const unitPrice = round2(product.priceForSize(size));
    return {
      product: product._id,
      title: product.title,
      slug: product.slug,
      image: product.images.find((i) => i.isPrimary)?.url || product.images[0]?.url,
      size,
      cardMessage: item.cardMessage,
      wrappingNote: item.wrappingNote,
      unitPrice,
      quantity: item.quantity,
      lineTotal: round2(unitPrice * item.quantity),
      recipe: product.scaleRecipe(size),
    };
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));

  let discount = 0;
  let coupon;
  if (couponCode) {
    const check = await couponService.validateForCustomer(couponCode, customerId, subtotal);
    discount = check.discount;
    coupon = check.coupon;
  }

  const tax = round2((subtotal - discount) * TAX_RATE);
  const total = round2(subtotal - discount + DELIVERY_FEE + tax);

  // Reversible side effects: reserve stock, redeem coupon.
  const ops = [];
  sumByProduct(lines).forEach((qty, id) => ops.push(productOp.reserve(id, qty)));
  if (coupon) {
    ops.push({
      apply: () => couponService.redeem(coupon._id, customerId),
      undo: () => couponService.release(coupon._id, customerId),
    });
  }

  const done = await runOps(ops);

  try {
    const order = await createWithRetry({
      customer: customerId,
      items: lines,
      subtotal,
      discount,
      coupon: coupon
        ? {
            couponId: coupon._id,
            code: coupon.code,
            type: coupon.discountType,
            value: coupon.discountValue,
          }
        : undefined,
      deliveryFee: DELIVERY_FEE,
      tax,
      total,
      paymentMethod,
      paymentStatus: 'PENDING',
      delivery,
      status: 'PLACED',
    });

    // Fire-and-forget: cart cleanup failure must not fail the order.
    cartService.removeOrderedProducts(customerId, ids).catch((err) => {
      console.error('[order] cart cleanup failed:', err.message);
    });

    return order;
  } catch (err) {
    await rollbackOps(done);
    throw err;
  }
};

const getMyOrders = async (customerId, page, limit, status) => {
  const query = { customer: customerId };
  if (status) query.status = status;

  const [orders, total] = await Promise.all([
    Order.find(query).sort({ createdAt: -1 }).skip(skipFor(page, limit)).limit(limit),
    Order.countDocuments(query),
  ]);

  return {
    items: orders.map(serializer.toCustomerView),
    pagination: paginationMeta(total, page, limit),
  };
};

const loadAccessibleOrder = async (id, user) => {
  const order = await Order.findById(id);
  if (!order || (user.role !== ROLES.ADMIN && order.customer.toString() !== user.id)) {
    throw new AppError('Order not found', 404);
  }
  return order;
};

const getOrderById = async (id, user) => {
  if (user.role === ROLES.ADMIN) {
    const order = await Order.findById(id)
      .populate('customer', 'name email phone')
      .populate('assignedFlorist', 'name email');
    if (!order) throw new AppError('Order not found', 404);
    return serializer.toAdminView(order);
  }
  return serializer.toCustomerView(await loadAccessibleOrder(id, user));
};

const trackOrder = async (id, user) =>
  serializer.toTrackingView(await loadAccessibleOrder(id, user));

/**
 * Called after an order was cancelled. Paid ONLINE orders are refunded; ONLINE orders that were never paid get
 * their open PaymentIntent voided so the customer cannot be charged afterwards. Failures are logged, never thrown:
 * the order itself is already cancelled.
 */
const tryRefund = async (order, reason, actorId) => {
  if (order.paymentMethod !== 'ONLINE') return;

  if (order.paymentStatus !== 'PAID') {
    try {
      await paymentService.cancelPendingPayment(order._id);
    } catch (err) {
      console.error(`[order] could not void pending payment for order ${order._id}:`, err.message);
    }
    return;
  }

  try {
    await paymentService.refundOrder(order._id, null, reason || 'Order cancelled', actorId);

    order.paymentStatus = 'REFUNDED';
    await order.save();
  } catch (err) {
    console.error(`[order] refund failed for order ${order._id}:`, err.message);
  }
};

const cancelOrder = async (id, user, reason) => {
  const order = await loadAccessibleOrder(id, user);

  if (UNCANCELLABLE_STATES.includes(order.status)) {
    throw new AppError(`Order cannot be cancelled at status ${order.status}`, 409);
  }

  if (user.role === ROLES.CUSTOMER && !CUSTOMER_CANCELLABLE.includes(order.status)) {
    throw new AppError(`Order cannot be cancelled at status ${order.status}`, 409);
  }

  order.cancellationReason = reason;
  await applyTransition(order, 'CANCELLED', user.id, reason || `Cancelled by ${user.role}`);

  await tryRefund(order, reason, user.id);

  return user.role === ROLES.ADMIN
    ? serializer.toAdminView(order)
    : serializer.toCustomerView(order);
};

const listOrders = async (f, page, limit) => {
  const query = {};
  if (f.status) query.status = f.status;
  if (f.floristId) query.assignedFlorist = f.floristId;
  if (f.customerId) query.customer = f.customerId;
  if (f.unassigned) query.assignedFlorist = null;

  if (f.date) {
    const start = new Date(f.date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    query['delivery.deliveryDate'] = { $gte: start, $lt: end };
  }

  const [orders, total] = await Promise.all([
    Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skipFor(page, limit))
      .limit(limit)
      .populate('customer', 'name email phone')
      .populate('assignedFlorist', 'name email'),
    Order.countDocuments(query),
  ]);

  return {
    items: orders.map(serializer.toAdminView),
    pagination: paginationMeta(total, page, limit),
  };
};

const updateStatus = async (id, newStatus, actorId, note) => {
  const order = await Order.findById(id);
  if (!order) throw new AppError('Order not found', 404);

  if (newStatus === 'CANCELLED') {
    // Same behaviour as cancelOrder(): record the reason and refund an already-paid ONLINE order.
    order.cancellationReason = note;
    await applyTransition(order, 'CANCELLED', actorId, note || 'Cancelled by admin');
    await tryRefund(order, note, actorId);
    return serializer.toAdminView(order);
  }

  await applyTransition(order, newStatus, actorId, note);

  if (newStatus === 'DELIVERED' && order.paymentMethod === 'COD') {
    paymentService.markCodPaid(order._id, order.total).catch((err) => {
      console.error('[order] COD payment record failed:', err.message);
    });
  }

  return serializer.toAdminView(order);
};

const assignFlorist = async (orderId, floristId) => {
  const florist = await User.findById(floristId);
  if (!florist || florist.role !== ROLES.FLORIST) {
    throw new AppError('Florist not found', 404);
  }
  if (!florist.isActive) throw new AppError('Florist is inactive', 400);

  const profile = await FloristProfile.findOne({ user: florist._id }).select('approvalStatus');
  if (!profile || profile.approvalStatus !== FLORIST_STATUS.APPROVED) {
    throw new AppError('Florist has not been approved', 400);
  }

  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);
  if (order.isTerminal) throw new AppError('Cannot assign a closed order', 409);

  order.assignedFlorist = florist._id;
  order.assignedAt = new Date();
  await order.save();
  await order.populate('assignedFlorist', 'name email');

  return serializer.toAdminView(order);
};

const updatePayment = async (orderId, { paymentStatus, transactionRef }) => {
  if (!VALID_PAYMENT_STATUSES.includes(paymentStatus)) {
    throw new AppError(
      `paymentStatus must be one of: ${VALID_PAYMENT_STATUSES.join(', ')}`,
      400
    );
  }

  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);
  if (order.status === 'CANCELLED') {
    throw new AppError('Cannot change payment of a cancelled order', 409);
  }
  if (order.paymentMethod !== 'ONLINE') {
    throw new AppError(
      'Only ONLINE payments are updated manually (COD is settled on delivery)',
      409
    );
  }
  if (order.paymentStatus === 'REFUNDED') {
    throw new AppError('Order is already refunded', 409);
  }
  // A settled payment can only be reversed through the refund endpoint (which talks to the payment provider);
  // flipping PAID -> FAILED here would leave the books inconsistent with the provider.
  if (order.paymentStatus === 'PAID' && paymentStatus !== 'PAID') {
    throw new AppError('A paid order cannot be marked as failed; issue a refund instead', 409);
  }

  order.paymentStatus = paymentStatus;
  if (paymentStatus === 'PAID') order.paidAt = new Date();
  if (transactionRef) order.transactionRef = transactionRef;
  await order.save();

  return serializer.toAdminView(order);
};

const getAdminStats = async () => {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);

  // PLACED is intentionally excluded — unconfirmed intent is not revenue.
  const revenueStatuses = ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];

  const [revenueAgg, activeOrders, todayOrders, lowStockProducts, byStatus] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          status: { $in: revenueStatuses },
          createdAt: { $gte: startOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    Order.countDocuments({ status: { $in: ACTIVE_ORDER_STATUSES } }),
    Order.countDocuments({ createdAt: { $gte: startOfDay } }),
    productService.countLowStock(),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  const ordersByStatus = {};
  byStatus.forEach((s) => {
    ordersByStatus[s._id] = s.count;
  });

  return {
    monthRevenue: revenueAgg[0]?.total || 0,
    activeOrders,
    todayOrders,
    lowStockProducts,
    ordersByStatus,
  };
};

const FLORIST_FIELDS = 'orderNumber status items delivery.deliveryDate delivery.slot';

const getFloristQueue = async (floristId) => {
  const orders = await Order.find({
    assignedFlorist: floristId,
    status: { $in: ['CONFIRMED', 'PREPARING'] },
  })
    .sort({ 'delivery.deliveryDate': 1, createdAt: 1 })
    .select(FLORIST_FIELDS);

  return orders.map(serializer.toFloristView);
};

const updatePrepStatus = async (orderId, floristId, newStatus, note) => {
 
  if (!FLORIST_ALLOWED_STATUSES.includes(newStatus)) {
    throw new AppError(
      `Florist can only set: ${FLORIST_ALLOWED_STATUSES.join(' or ')}`,
      403
    );
  }

  const order = await Order.findById(orderId);

  if (!order || !order.assignedFlorist || order.assignedFlorist.toString() !== floristId) {
    throw new AppError('Order not found', 404);
  }

  await applyTransition(order, newStatus, floristId, note);
  return serializer.toFloristView(order);
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  trackOrder,
  cancelOrder,
  listOrders,
  updateStatus,
  assignFlorist,
  updatePayment,
  getAdminStats,
  getFloristQueue,
  updatePrepStatus,
  FLORIST_FIELDS,
};