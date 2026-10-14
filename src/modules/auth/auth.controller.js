const authService = require('./auth.service');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');

const register = asyncHandler(async (req, res) => {
  const user = await authService.registerCustomer(req.body);
  sendSuccess(res, { status: 201, message: 'User registered successfully', data: { user } });
});

const registerFlorist = asyncHandler(async (req, res) => {
  const user = await authService.registerFlorist(req.body);
  sendSuccess(res, {
    status: 201,
    message: 'Florist application submitted. You will be able to work once an admin approves your account.',
    data: { user },
  });
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body.email, req.body.password, req);
  sendSuccess(res, { message: 'Login successful', data: result });
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user.id, req.user.role, req);
  sendSuccess(res, { message: 'Logged out successfully' });
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.id);
  sendSuccess(res, { data: { user } });
});

const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateMe(req.user.id, req.body);
  sendSuccess(res, { message: 'Profile updated', data: { user } });
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
  sendSuccess(res, { message: 'Password changed successfully', data: result });
});

module.exports = { register, registerFlorist, login, logout, me, updateMe, changePassword };
