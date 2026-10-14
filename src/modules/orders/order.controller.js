const service = require('./order.service');
const serializer = require('./order.serializer');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const { logAction } = require('../admin/adminLog.service');
const { ROLES } = require('../../constants');

const createOrder = asyncHandler(async (req, res) => {
  const order = await service.createOrder(req.user.id, req.body);
  sendSuccess(res, { status: 201, message: 'Order placed successfully', data: { order: serializer.toCustomerView(order) } });
});

const getMyOrders = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await service.getMyOrders(req.user.id, req.query.page, req.query.limit, req.query.status) });
});

const getOrder = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { order: await service.getOrderById(req.params.id, req.user) } });
});

const trackOrder = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { tracking: await service.trackOrder(req.params.id, req.user) } });
});

const cancelOrder = asyncHandler(async (req, res) => {
  const order = await service.cancelOrder(req.params.id, req.user, req.body.reason);
  if (req.user.role === ROLES.ADMIN) logAction(req, 'ORDER_CANCELLED', 'ORDER', req.params.id, { note: req.body.reason });
  sendSuccess(res, { message: 'Order cancelled', data: { order } });
});

const listOrders = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;
  sendSuccess(res, { data: await service.listOrders(filters, page, limit) });
});

const updateStatus = asyncHandler(async (req, res) => {
  const order = await service.updateStatus(req.params.id, req.body.status, req.user.id, req.body.note);
  logAction(req, req.body.status === 'CANCELLED' ? 'ORDER_CANCELLED' : 'ORDER_STATUS_UPDATED', 'ORDER', req.params.id, {
    after: { status: order.status },
    note: req.body.note,
  });
  sendSuccess(res, { message: 'Status updated', data: { order } });
});

const assignFlorist = asyncHandler(async (req, res) => {
  const order = await service.assignFlorist(req.params.id, req.body.floristId);
  logAction(req, 'ORDER_ASSIGNED', 'ORDER', req.params.id, { after: { assignedFlorist: req.body.floristId } });
  sendSuccess(res, { message: 'Florist assigned', data: { order } });
});

const updatePayment = asyncHandler(async (req, res) => {
  const order = await service.updatePayment(req.params.id, req.body);
  logAction(req, 'ORDER_PAYMENT_UPDATED', 'ORDER', req.params.id, { after: { paymentStatus: order.paymentStatus } });
  sendSuccess(res, { message: 'Payment status updated', data: { order } });
});

const getAdminStats = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await service.getAdminStats() });
});

const getFloristQueue = asyncHandler(async (req, res) => {
  const items = await service.getFloristQueue(req.user.id);
  sendSuccess(res, { data: { count: items.length, items } });
});

const updatePrepStatus = asyncHandler(async (req, res) => {
  const order = await service.updatePrepStatus(req.params.id, req.user.id, req.body.status, req.body.note);
  sendSuccess(res, { message: 'Prep status updated', data: { order } });
});

module.exports = {
  createOrder, getMyOrders, getOrder, trackOrder, cancelOrder, listOrders, updateStatus,
  assignFlorist, updatePayment, getAdminStats, getFloristQueue, updatePrepStatus,
};
