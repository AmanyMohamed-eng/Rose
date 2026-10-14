const AdminLog = require('../../models/adminLog');

const logAction = (req, action, targetType, targetId, { before, after, note } = {}) => {
  if (!req.user?.id) return;

  AdminLog.create({
    admin: req.user.id,
    action,
    targetType,
    targetId,
    changes: before || after ? { before, after } : undefined,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    note,
  }).catch((err) => {
    console.error('[adminLog] failed:', err.message);
  });
};

const listLogs = async (filters = {}, page = 1, limit = 50) => {
  const query = {};
  if (filters.adminId) query.admin = filters.adminId;
  if (filters.action) query.action = filters.action;
  if (filters.targetType) query.targetType = filters.targetType;
  if (filters.targetId) query.targetId = filters.targetId;

  if (filters.from || filters.to) {
    query.createdAt = {};
    if (filters.from) query.createdAt.$gte = new Date(filters.from);
    if (filters.to) query.createdAt.$lte = new Date(filters.to);
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    AdminLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('admin', 'name email'),
    AdminLog.countDocuments(query),
  ]);

  return { items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
};

module.exports = { logAction, listLogs };