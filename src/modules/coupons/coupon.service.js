const Coupon = require('../../models/Coupon');
const AppError = require('../../utils/AppError');
const { paginationMeta, skipFor } = require('../../utils/pagination');
const { escapeRegex, round2 } = require('../../utils/helpers');

// ---------- Admin CRUD ----------
const list = async (f, page, limit) => {
  const q = {};
  if (f.isActive !== undefined) q.isActive = f.isActive;
  if (f.expired !== undefined) q.expiryDate = f.expired ? { $lt: new Date() } : { $gte: new Date() };
  if (f.search) q.code = new RegExp(escapeRegex(f.search), 'i');

  const [items, total] = await Promise.all([
    Coupon.find(q).sort({ createdAt: -1 }).skip(skipFor(page, limit)).limit(limit).select('-usedBy'),
    Coupon.countDocuments(q),
  ]);
  return { items, pagination: paginationMeta(total, page, limit) };
};

const getById = async (id) => {
  const coupon = await Coupon.findById(id);
  if (!coupon) throw new AppError('Coupon not found', 404);
  return coupon;
};

const create = async (data, adminId) => {
  try {
    return await Coupon.create({ ...data, startDate: data.startDate || new Date(), createdBy: adminId });
  } catch (err) {
    if (err.code === 11000) throw new AppError('Coupon code already exists', 409);
    throw err;
  }
};

const update = async (id, data) => {
  const coupon = await getById(id);
  Object.assign(coupon, data);
  await coupon.save(); // runs the model's cross-field validation
  return coupon;
};

const toggleStatus = async (id) => {
  const coupon = await getById(id);
  coupon.isActive = !coupon.isActive;
  await coupon.save();
  return coupon;
};

const remove = async (id) => {
  const coupon = await getById(id);
  if (coupon.usedCount > 0) {
    throw new AppError('This coupon has been used; deactivate it instead of deleting', 409);
  }
  await coupon.deleteOne();
  return coupon;
};

// ---------- Discount maths & validation ----------
const computeDiscount = (coupon, subtotal) => {
  let discount = coupon.discountType === 'PERCENTAGE' ? (subtotal * coupon.discountValue) / 100 : coupon.discountValue;
  if (coupon.discountType === 'PERCENTAGE' && coupon.maxDiscountAmount) {
    discount = Math.min(discount, coupon.maxDiscountAmount);
  }
  return round2(Math.min(discount, subtotal));
};

/** Read-only eligibility check (friendly errors). Redemption itself is atomic — see redeem(). */
const validateForCustomer = async (code, customerId, subtotal) => {
  const coupon = await Coupon.findOne({ code: String(code).toUpperCase() });
  const now = new Date();
  if (!coupon || !coupon.isActive) throw new AppError('Invalid coupon code', 400);
  if (coupon.startDate > now) throw new AppError('Coupon is not active yet', 400);
  if (coupon.expiryDate < now) throw new AppError('Coupon expired', 400);
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    throw new AppError('Coupon usage limit reached', 400);
  }
  const mine = coupon.usedBy.find((u) => u.customer.toString() === String(customerId));
  if (mine && mine.usageCount >= coupon.usageLimitPerCustomer) {
    throw new AppError('You have already used this coupon the maximum number of times', 400);
  }
  if (coupon.minOrderAmount && subtotal < coupon.minOrderAmount) {
    throw new AppError(`Minimum order amount for this coupon is ${coupon.minOrderAmount}`, 400);
  }
  return { coupon, discount: computeDiscount(coupon, subtotal) };
};

// ---------- Atomic usage tracking ----------
const globalLimitOk = {
  $expr: {
    $or: [
      { $eq: [{ $ifNull: ['$usageLimit', null] }, null] },
      { $lt: ['$usedCount', '$usageLimit'] },
    ],
  },
};

/** Atomically consumes one use for this customer. Throws 409 if the coupon became unavailable. */
const redeem = async (couponId, customerId) => {
  const now = new Date();
  const base = { _id: couponId, isActive: true, startDate: { $lte: now }, expiryDate: { $gte: now }, ...globalLimitOk };

  // 1) customer already has a usage entry below their personal limit
  const coupon = await Coupon.findById(couponId).select('usageLimitPerCustomer');
  if (!coupon) throw new AppError('Coupon no longer exists', 409);

  let res = await Coupon.updateOne(
    { ...base, usedBy: { $elemMatch: { customer: customerId, usageCount: { $lt: coupon.usageLimitPerCustomer } } } },
    { $inc: { usedCount: 1, 'usedBy.$.usageCount': 1 } }
  );
  // 2) first use by this customer
  if (res.modifiedCount === 0) {
    res = await Coupon.updateOne(
      { ...base, 'usedBy.customer': { $ne: customerId } },
      { $inc: { usedCount: 1 }, $push: { usedBy: { customer: customerId, usageCount: 1 } } }
    );
  }
  if (res.modifiedCount === 0) throw new AppError('Coupon is no longer available', 409);
};

/** Gives one use back (order cancelled / creation rolled back). */
const release = async (couponId, customerId) => {
  await Coupon.updateOne(
    { _id: couponId, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1, 'usedBy.$[e].usageCount': -1 } },
    { arrayFilters: [{ 'e.customer': customerId, 'e.usageCount': { $gt: 0 } }] }
  );
};

/** Undo of release() — used only when a rollback has to be rolled back. */
const reapply = async (couponId, customerId) => {
  await Coupon.updateOne(
    { _id: couponId },
    { $inc: { usedCount: 1, 'usedBy.$[e].usageCount': 1 } },
    { arrayFilters: [{ 'e.customer': customerId }] }
  );
};

module.exports = {
  list, getById, create, update, toggleStatus, remove, computeDiscount, validateForCustomer, redeem, release, reapply,
};
