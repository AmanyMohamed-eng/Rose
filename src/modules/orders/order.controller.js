const orderService = require('./order.service');
const {
  validateCreateOrder,
  validateUpdateStatus,
  validateAssignFlorist,
  validateCancel,
} = require('./order.validation');


const createOrder = async (req, res, next) => {
  try {
    validateCreateOrder(req.body);
    const order = await orderService.createOrder(req.user.id, req.body);
    res.status(201).json({ message: 'Order placed successfully', order });
  } catch (error) {
    next(error);
  }
};

const getMyOrders = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const result = await orderService.getMyOrders(
      req.user.id,
      page,
      limit,
      req.query.status
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getOrder = async (req, res, next) => {
  try {
    const order = await orderService.getOrderById(req.params.id, req.user);
    res.status(200).json({ order });
  } catch (error) {
    next(error);
  }
};

const cancelOrder = async (req, res, next) => {
  try {
    validateCancel(req.body);
    const order = await orderService.cancelOrder(
      req.params.id,
      req.user,
      req.body.reason
    );
    res.status(200).json({ message: 'Order cancelled', order });
  } catch (error) {
    next(error);
  }
};

const listOrders = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const result = await orderService.listOrders(req.query, page, limit);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    validateUpdateStatus(req.body);
    const order = await orderService.updateStatus(
      req.params.id,
      req.body.status,
      req.user.id,
      req.body.note
    );
    res.status(200).json({ message: 'Status updated', order });
  } catch (error) {
    next(error);
  }
};

const assignFlorist = async (req, res, next) => {
  try {
    validateAssignFlorist(req.body);
    const order = await orderService.assignFlorist(
      req.params.id,
      req.body.floristId,
      req.user.id
    );
    res.status(200).json({ message: 'Florist assigned', order });
  } catch (error) {
    next(error);
  }
};

const getAdminStats = async (req, res, next) => {
  try {
    const stats = await orderService.getAdminStats();
    res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
};

const getFloristQueue = async (req, res, next) => {
  try {
    const items = await orderService.getFloristQueue(req.user.id);
    res.status(200).json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
};

const updatePrepStatus = async (req, res, next) => {
  try {
    const order = await orderService.updatePrepStatus(
      req.params.id,
      req.user.id,
      req.body.status,
      req.body.note
    );
    res.status(200).json({ message: 'Prep status updated', order });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrder,
  cancelOrder,
  listOrders,
  updateStatus,
  assignFlorist,
  getAdminStats,
  getFloristQueue,
  updatePrepStatus,
};