const service = require('./coupon.service');
const cartService = require('../cart/cart.service');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const { logAction } = require('../admin/adminLog.service');
const { round2 } = require('../../utils/helpers');

const list = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;
  sendSuccess(res, { data: await service.list(filters, page, limit) });
});

const get = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { coupon: await service.getById(req.params.id) } });
});

const create = asyncHandler(async (req, res) => {
  const coupon = await service.create(req.body, req.user.id);
  logAction(req, 'COUPON_CREATED', 'COUPON', coupon._id, { after: coupon.toJSON() });
  sendSuccess(res, { status: 201, message: 'Coupon created', data: { coupon } });
});

const update = asyncHandler(async (req, res) => {
  const before = (await service.getById(req.params.id)).toJSON();
  const coupon = await service.update(req.params.id, req.body);
  logAction(req, 'COUPON_UPDATED', 'COUPON', coupon._id, { before, after: coupon.toJSON() });
  sendSuccess(res, { message: 'Coupon updated', data: { coupon } });
});

const toggleStatus = asyncHandler(async (req, res) => {
  const coupon = await service.toggleStatus(req.params.id);
  logAction(req, 'COUPON_STATUS_TOGGLED', 'COUPON', coupon._id, { after: { isActive: coupon.isActive } });
  sendSuccess(res, { message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'}`, data: { coupon } });
});

const remove = asyncHandler(async (req, res) => {
  const coupon = await service.remove(req.params.id);
  logAction(req, 'COUPON_DELETED', 'COUPON', coupon._id, { before: coupon.toJSON() });
  sendSuccess(res, { message: 'Coupon deleted' });
});

// Customer: preview the discount against the server-side cart total.
const validateCoupon = asyncHandler(async (req, res) => {
  const { subtotal } = await cartService.calculateTotal(req.user.id);
  const { coupon, discount } = await service.validateForCustomer(req.body.code, req.user.id, subtotal);
  sendSuccess(res, {
    message: 'Coupon is valid',
    data: {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      subtotal,
      discount,
      subtotalAfterDiscount: round2(subtotal - discount),
    },
  });
});

module.exports = { list, get, create, update, toggleStatus, remove, validateCoupon };
