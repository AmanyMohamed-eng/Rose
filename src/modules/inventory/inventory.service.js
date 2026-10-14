const InventoryItem = require('../../models/InventoryItem');
const AppError = require('../../utils/AppError');
const { paginationMeta, skipFor } = require('../../utils/pagination');
const { escapeRegex } = require('../../utils/helpers');

const lowStockExpr = {
  $and: [{ $gt: ['$quantity', 0] }, { $lte: ['$quantity', '$lowStockThreshold'] }],
};
const lowOrOutExpr = { $lte: ['$quantity', '$lowStockThreshold'] };

const list = async (f, page, limit) => {
  const q = {};
  if (f.type) q.type = f.type;
  if (f.isActive !== undefined) q.isActive = f.isActive;
  if (f.search) q.name = new RegExp(escapeRegex(f.search), 'i');
  if (f.lowStock) q.$expr = lowOrOutExpr;

  const [items, total] = await Promise.all([
    InventoryItem.find(q).sort({ type: 1, name: 1 }).skip(skipFor(page, limit)).limit(limit),
    InventoryItem.countDocuments(q),
  ]);
  return { items, pagination: paginationMeta(total, page, limit) };
};

const getById = async (id) => {
  const item = await InventoryItem.findById(id);
  if (!item) throw new AppError('Inventory item not found', 404);
  return item;
};

const getLowStock = () =>
  InventoryItem.find({ isActive: true, $expr: lowOrOutExpr }).sort({ quantity: 1 });

const create = async (data) => InventoryItem.create(data);

const update = async (id, data) => {
  const item = await getById(id);
  Object.assign(item, data);
  await item.save();
  return item;
};

/** Atomic: never lets quantity go negative. Provide either {delta} or {quantity}. */
const adjust = async (id, { delta, quantity }) => {
  let updated;
  if (quantity !== undefined) {
    updated = await InventoryItem.findByIdAndUpdate(id, { $set: { quantity } }, { new: true });
  } else if (delta > 0) {
    updated = await InventoryItem.findByIdAndUpdate(id, { $inc: { quantity: delta } }, { new: true });
  } else {
    updated = await InventoryItem.findOneAndUpdate(
      { _id: id, quantity: { $gte: -delta } },
      { $inc: { quantity: delta } },
      { new: true }
    );
    if (!updated) {
      await getById(id); // 404 if it does not exist
      throw new AppError('Insufficient inventory for this adjustment', 409);
    }
  }
  if (!updated) throw new AppError('Inventory item not found', 404);
  return updated;
};

const deactivate = async (id) => {
  const item = await InventoryItem.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!item) throw new AppError('Inventory item not found', 404);
  return item;
};

// ---------- Used by the order service (recipe consumption) ----------
const consumeStock = async (id, qty) => {
  const res = await InventoryItem.updateOne({ _id: id, quantity: { $gte: qty } }, { $inc: { quantity: -qty } });
  if (res.matchedCount === 0) {
    const item = await InventoryItem.findById(id).select('name');
    throw new AppError(
      item ? `Insufficient inventory for ${item.name}` : 'A recipe ingredient no longer exists',
      409
    );
  }
};

const restoreStock = async (id, qty) => {
  await InventoryItem.updateOne({ _id: id }, { $inc: { quantity: qty } });
};

const countLowAndOut = async () => {
  const [low, out] = await Promise.all([
    InventoryItem.countDocuments({ isActive: true, $expr: lowStockExpr }),
    InventoryItem.countDocuments({ isActive: true, quantity: { $lte: 0 } }),
  ]);
  return { lowStock: low, outOfStock: out };
};

module.exports = {
  list, getById, getLowStock, create, update, adjust, deactivate, consumeStock, restoreStock, countLowAndOut,
};
