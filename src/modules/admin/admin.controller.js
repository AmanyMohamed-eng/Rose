const service = require('./admin.service');
const logService = require('./adminLog.service');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const { FLORIST_STATUS } = require('../../constants');

const { logAction } = logService;

const getStats = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await service.getStats() });
});

// ---- users ----
const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;
  sendSuccess(res, { data: await service.listUsers(filters, page, limit) });
});

const getUser = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await service.getUser(req.params.id) });
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await service.updateUser(req.params.id, req.body);
  logAction(req, 'USER_UPDATED', 'USER', user._id, { after: req.body });
  sendSuccess(res, { message: 'User updated', data: { user } });
});

const updateUserRole = asyncHandler(async (req, res) => {
  const before = { role: (await service.getUser(req.params.id)).user.role };
  const user = await service.updateRole(req.params.id, req.body.role, req.user.id);
  logAction(req, 'USER_ROLE_CHANGED', 'USER', user._id, { before, after: { role: user.role } });
  sendSuccess(res, { message: 'Role updated', data: { user } });
});

const deactivateUser = asyncHandler(async (req, res) => {
  const user = await service.setActive(req.params.id, false, req.user.id);
  logAction(req, 'USER_DEACTIVATED', 'USER', user._id, { note: req.body.reason });
  sendSuccess(res, { message: 'User blocked', data: { user } });
});

const activateUser = asyncHandler(async (req, res) => {
  const user = await service.setActive(req.params.id, true, req.user.id);
  logAction(req, 'USER_ACTIVATED', 'USER', user._id, { note: req.body.reason });
  sendSuccess(res, { message: 'User unblocked', data: { user } });
});

// ---- florists ----
const listFlorists = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;
  sendSuccess(res, { data: await service.listFlorists(filters, page, limit) });
});

const getFlorist = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { florist: await service.getFlorist(req.params.id) } });
});

const createFlorist = asyncHandler(async (req, res) => {
  const florist = await service.createFlorist(req.body, req.user.id);
  logAction(req, 'FLORIST_CREATED', 'FLORIST', florist.user._id, { after: { email: florist.user.email } });
  sendSuccess(res, { status: 201, message: 'Florist created and approved', data: { florist } });
});

const updateFloristProfile = asyncHandler(async (req, res) => {
  const florist = await service.updateFloristProfile(req.params.id, req.body);
  logAction(req, 'FLORIST_PROFILE_UPDATED', 'FLORIST', req.params.id, { after: req.body });
  sendSuccess(res, { message: 'Florist profile updated', data: { florist } });
});

const approveFlorist = asyncHandler(async (req, res) => {
  const florist = await service.reviewFlorist(req.params.id, req.user.id, FLORIST_STATUS.APPROVED);
  logAction(req, 'FLORIST_APPROVED', 'FLORIST', req.params.id);
  sendSuccess(res, { message: 'Florist approved', data: { florist } });
});

const rejectFlorist = asyncHandler(async (req, res) => {
  const florist = await service.reviewFlorist(req.params.id, req.user.id, FLORIST_STATUS.REJECTED, req.body.reason);
  logAction(req, 'FLORIST_REJECTED', 'FLORIST', req.params.id, { note: req.body.reason });
  sendSuccess(res, { message: 'Florist rejected', data: { florist } });
});

// ---- logs / profile ----
const listLogs = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;
  sendSuccess(res, { data: await logService.listLogs(filters, page, limit) });
});

const getProfile = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { profile: await service.getOwnProfile(req.user.id) } });
});

const updateProfile = asyncHandler(async (req, res) => {
  const profile = await service.updateOwnProfile(req.user.id, req.body);
  logAction(req, 'ADMIN_PROFILE_UPDATED', 'USER', req.user.id);
  sendSuccess(res, { message: 'Profile updated', data: { profile } });
});

module.exports = {
  getStats, listUsers, getUser, updateUser, updateUserRole, deactivateUser, activateUser, listFlorists, getFlorist,
  createFlorist, updateFloristProfile, approveFlorist, rejectFlorist, listLogs, getProfile, updateProfile,
};
