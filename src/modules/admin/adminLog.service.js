const AdminLog = require('../../models/AdminLog');
const { paginationMeta, skipFor } = require('../../utils/pagination');

/**
 * Fire-and-forget audit entry. Never throws into the request flow.
 * @param {object} req express request (uses req.user.id, req.ip, user-agent)
 * @param {string} action one of ADMIN_ACTIONS
 * @param {string} targetType one of ADMIN_TARGETS
 * @param {string|ObjectId} [targetId]
 * @param {{before?:any, after?:any, note?:string, actorId?:string}} [opts]
 */
const logAction = (req, action, targetType, targetId, { before, after, note, actorId } = {}) => {
  const admin = actorId || req.user?.id;
  if (!admin) return;

  AdminLog.create({
    admin,
    action,
    targetType,
    targetId: targetId || undefined,
    changes: before !== undefined || after !== undefined ? { before, after } : undefined,
    ip: req.ip,
    userAgent: req.headers?.['user-agent'],
    note: note ? String(note).slice(0, 300) : undefined,
  }).catch((err) => console.error('[adminLog] failed:', err.message));
};

const listLogs = async (filters, page, limit) => {
  const query = {};
  if (filters.adminId) query.admin = filters.adminId;
  if (filters.action) query.action = filters.action;
  if (filters.targetType) query.targetType = filters.targetType;
  if (filters.targetId) query.targetId = filters.targetId;
  if (filters.from || filters.to) {
    query.createdAt = {};
    if (filters.from) query.createdAt.$gte = filters.from;
    if (filters.to) query.createdAt.$lte = filters.to;
  }

  const [items, total] = await Promise.all([
    AdminLog.find(query).sort({ createdAt: -1 }).skip(skipFor(page, limit)).limit(limit).populate('admin', 'name email'),
    AdminLog.countDocuments(query),
  ]);
  return { items, pagination: paginationMeta(total, page, limit) };
};

module.exports = { logAction, listLogs };
