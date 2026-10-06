const Order = require('../../models/order');
const Product = require('../../models/product');
const User = require('../../models/user');
const Coupon = require('../../models/coupon');
const AppError = require('../../utils/AppError');

const DELIVERY_FEE = 40;
const TAX_RATE = 0; 

const reserveStock = async (productId, qty) => {
  const result = await Product.findOneAndUpdate(
    {
      _id: productId,
      isActive: true,
      $expr: {
        $gte: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, qty],
      },
    },
    { $inc: { reservedQuantity: qty } },
    { new: true }
  );
  if (!result) throw new AppError('Insufficient stock for one or more items', 409);
  return result;
};

const releaseReservation = async (productId, qty) => {
  await Product.updateOne(
    { _id: productId },
    { $inc: { reservedQuantity: -qty } }
  );
};

const commitSale = async (productId, qty) => {
  const result = await Product.findOneAndUpdate(
    {
      _id: productId,
      stockQuantity: { $gte: qty },
      reservedQuantity: { $gte: qty },
    },
    {
      $inc: {
        stockQuantity: -qty,
        reservedQuantity: -qty,
        soldCount: qty,
      },
    },
    { new: true }
  );
  if (!result) throw new AppError('Stock commit failed — inventory mismatch', 409);
};

const reverseSale = async (productId, qty) => {
  await Product.updateOne(
    { _id: productId },
    { $inc: { stockQuantity: qty, soldCount: -qty } }
  );
};

const resolveCoupon = async (code, subtotal) => {
  if (!code) return { discount: 0, coupon: null };

  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
  if (!coupon) throw new AppError('Invalid coupon code', 400);
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw new AppError('Coupon expired', 400);
  }
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    throw new AppError('Coupon usage limit reached', 400);
  }
  if (coupon.minOrderValue && subtotal < coupon.minOrderValue) {
    throw new AppError(`Minimum order value for this coupon is ${coupon.minOrderValue}`, 400);
  }

  let discount = 0;
  if (coupon.type === 'PERCENT') {
    discount = Math.round((subtotal * coupon.value) / 100);
  } else if (coupon.type === 'FIXED') {
    discount = Math.min(coupon.value, subtotal);
  }

  return {
    discount,
    coupon: { code: coupon.code, type: coupon.type, value: coupon.value },
  };
};

const createOrder = async (customerId, payload) => {
  const { items, delivery, paymentMethod, couponCode } = payload;

  const productIds = items.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds }, isActive: true });
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  for (const item of items) {
    if (!productMap.has(item.productId)) {
      throw new AppError(`Product ${item.productId} not found or unavailable`, 404);
    }
  }

  const lineItems = items.map((item) => {
    const product = productMap.get(item.productId);
    const size = item.size || 'Standard';
    const unitPrice = product.priceForSize(size); 
    const lineTotal = unitPrice * item.quantity;
    const recipe = product.scaleRecipe(size); 

    const primaryImg =
      product.images.find((i) => i.isPrimary)?.url || product.images[0]?.url;

    return {
      product: product._id,
      title: product.title,
      slug: product.slug,
      image: primaryImg,
      size,
      cardMessage: item.cardMessage,
      wrappingNote: item.wrappingNote,
      unitPrice,
      quantity: item.quantity,
      lineTotal,
      recipe,
    };
  });

  const subtotal = lineItems.reduce((sum, i) => sum + i.lineTotal, 0);
  const { discount, coupon } = await resolveCoupon(couponCode, subtotal);
  const tax = Math.round((subtotal - discount) * TAX_RATE);
  const total = subtotal - discount + DELIVERY_FEE + tax;

  const reserved = [];
  try {
    for (const item of items) {
      await reserveStock(item.productId, item.quantity);
      reserved.push(item);
    }
  } catch (err) {
    await Promise.all(
      reserved.map((r) =>
        releaseReservation(r.productId, r.quantity).catch(() => {})
      )
    );
    throw err;
  }

  try {
    const order = await Order.create({
      customer: customerId,
      items: lineItems,
      subtotal,
      discount,
      coupon: coupon || undefined,
      deliveryFee: DELIVERY_FEE,
      tax,
      total,
      paymentMethod,
      paymentStatus: 'PENDING',
      delivery,
      status: 'PLACED',
    });

    // bump coupon usage (fire-and-forget)
    if (coupon) {
      Coupon.updateOne({ code: coupon.code }, { $inc: { usedCount: 1 } }).catch(() => {});
    }

    return order;
  } catch (err) {
    await Promise.all(
      reserved.map((r) =>
        releaseReservation(r.productId, r.quantity).catch(() => {})
      )
    );
    throw err;
  }
};

const getMyOrders = async (customerId, page = 1, limit = 10, status) => {
  const query = { customer: customerId };
  if (status) query.status = status;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(query),
  ]);

  return {
    items,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  };
};

const getOrderById = async (id, user) => {
  const order = await Order.findById(id)
    .populate('customer', 'name email phone')
    .populate('assignedFlorist', 'name email');

  if (!order) throw new AppError('Order not found', 404);

  const isOwner = order.customer._id.toString() === user.id;
  const isAdmin = user.role === 'admin';
  const isAssignedFlorist =
    user.role === 'florist' &&
    order.assignedFlorist &&
    order.assignedFlorist._id.toString() === user.id;

  if (!isOwner && !isAdmin && !isAssignedFlorist) {
    throw new AppError('You do not have access to this order', 403);
  }
  return order;
};

const cancelOrder = async (id, user, reason) => {
  const order = await Order.findById(id);
  if (!order) throw new AppError('Order not found', 404);

  const isOwner = order.customer.toString() === user.id;
  const isAdmin = user.role === 'admin';
  if (!isOwner && !isAdmin) throw new AppError('Forbidden', 403);

  if (!order.isCancellable) {
    throw new AppError(`Order cannot be cancelled at status ${order.status}`, 409);
  }

  if (order.status === 'PLACED') {
    await Promise.all(
      order.items.map((i) => releaseReservation(i.product, i.quantity))
    );
  } else {
    await Promise.all(
      order.items.map((i) => reverseSale(i.product, i.quantity))
    );
  }

  order.transitionTo('CANCELLED', user.id, reason || 'Cancelled by user');
  order.cancellationReason = reason;

  if (order.paymentMethod === 'ONLINE' && order.paymentStatus === 'PAID') {
    order.paymentStatus = 'REFUNDED';
  }

  await order.save();
  return order;
};

const listOrders = async (filters = {}, page = 1, limit = 20) => {
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.floristId) query.assignedFlorist = filters.floristId;
  if (filters.customerId) query.customer = filters.customerId;
  if (filters.unassigned === 'true') query.assignedFlorist = null;

  if (filters.date) {
    const d = new Date(filters.date);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    query['delivery.deliveryDate'] = { $gte: d, $lt: next };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('customer', 'name email phone')
      .populate('assignedFlorist', 'name email'),
    Order.countDocuments(query),
  ]);

  return {
    items,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  };
};

const updateStatus = async (id, newStatus, actorId, note) => {
  const order = await Order.findById(id);
  if (!order) throw new AppError('Order not found', 404);

  if (order.status === 'PLACED' && newStatus === 'CONFIRMED') {
    await Promise.all(order.items.map((i) => commitSale(i.product, i.quantity)));
  }

  if (newStatus === 'CANCELLED' && order.status !== 'PLACED') {
    await Promise.all(order.items.map((i) => reverseSale(i.product, i.quantity)));
  }

  if (newStatus === 'CANCELLED' && order.status === 'PLACED') {
    await Promise.all(
      order.items.map((i) => releaseReservation(i.product, i.quantity))
    );
  }

  order.transitionTo(newStatus, actorId, note); // throws on illegal transitions
  await order.save();
  return order;
};

const assignFlorist = async (orderId, floristId, actorId) => {
  const florist = await User.findById(floristId);
  if (!florist) throw new AppError('Florist not found', 404);
  if (florist.role !== 'florist') throw new AppError('User is not a florist', 400);
  if (!florist.isActive) throw new AppError('Florist is inactive', 400);

  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);
  if (order.isTerminal) throw new AppError('Cannot assign a closed order', 409);

  order.assignedFlorist = florist._id;
  order.assignedAt = new Date();
  await order.save();
  return order;
};

const getAdminStats = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const [revenueAgg, activeOrders, todayOrders, lowStockCount] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          status: {
            $in: ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'],
          },
          createdAt: { $gte: startOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    Order.countDocuments({
      status: { $in: ['PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] },
    }),
    Order.countDocuments({ createdAt: { $gte: startOfDay } }),
    Product.countDocuments({
      isActive: true,
      $expr: {
        $and: [
          { $gt: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, 0] },
          { $lte: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, '$lowStockThreshold'] },
        ],
      },
    }),
  ]);

  return {
    monthRevenue: revenueAgg[0]?.total || 0,
    activeOrders,
    todayOrders,
    lowStockProducts: lowStockCount,
  };
};

const getFloristQueue = async (floristId) => {
  const items = await Order.find({
    assignedFlorist: floristId,
    status: { $in: ['CONFIRMED', 'PREPARING'] },
  })
    .sort({ 'delivery.deliveryDate': 1, createdAt: 1 })
    .select(
      'orderNumber status items.title items.size items.quantity items.recipe ' +
        'items.cardMessage items.wrappingNote delivery.deliveryDate delivery.slot'
    );
  return items;
};

const updatePrepStatus = async (orderId, floristId, newStatus, note) => {
  if (!['PREPARING', 'READY'].includes(newStatus)) {
    throw new AppError('Florist can only set PREPARING or READY', 403);
  }

  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);
  if (!order.assignedFlorist || order.assignedFlorist.toString() !== floristId) {
    throw new AppError('You are not assigned to this order', 403);
  }

  order.transitionTo(newStatus, floristId, note);
  await order.save();
  return order;
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  listOrders,
  updateStatus,
  assignFlorist,
  getAdminStats,
  getFloristQueue,
  updatePrepStatus,
};