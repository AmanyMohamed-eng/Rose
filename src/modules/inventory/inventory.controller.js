const service = require('./inventory.service');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const { logAction } = require('../admin/adminLog.service');

const list = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;
  sendSuccess(res, { data: await service.list(filters, page, limit) });
});

const lowStock = asyncHandler(async (req, res) => {
  const items = await service.getLowStock();
  sendSuccess(res, { data: { count: items.length, items } });
});

const get = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { item: await service.getById(req.params.id) } });
});

const create = asyncHandler(async (req, res) => {
  const item = await service.create(req.body);
  logAction(req, 'INVENTORY_CREATED', 'INVENTORY', item._id, { after: item.toJSON() });
  sendSuccess(res, { status: 201, message: 'Inventory item created', data: { item } });
});

const update = asyncHandler(async (req, res) => {
  const before = (await service.getById(req.params.id)).toJSON();
  const item = await service.update(req.params.id, req.body);
  logAction(req, 'INVENTORY_UPDATED', 'INVENTORY', item._id, { before, after: item.toJSON() });
  sendSuccess(res, { message: 'Inventory item updated', data: { item } });
});

const adjust = asyncHandler(async (req, res) => {
  const before = (await service.getById(req.params.id)).quantity;
  const item = await service.adjust(req.params.id, req.body);
  logAction(req, 'INVENTORY_STOCK_ADJUSTED', 'INVENTORY', item._id, {
    before: { quantity: before },
    after: { quantity: item.quantity },
  });
  sendSuccess(res, { message: 'Inventory updated', data: { item } });
});

const deactivate = asyncHandler(async (req, res) => {
  const item = await service.deactivate(req.params.id);
  logAction(req, 'INVENTORY_DEACTIVATED', 'INVENTORY', item._id);
  sendSuccess(res, { message: 'Inventory item deactivated', data: { item } });
});

module.exports = { list, lowStock, get, create, update, adjust, deactivate };
