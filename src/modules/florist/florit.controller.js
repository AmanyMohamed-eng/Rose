const floristService = require('./florist.services');
const AppError = require('../../utils/AppError');

const getProfile = async (req, res, next) => {
  try {
    const profile = await floristService.getProfile(req.user.id);
    res.status(200).json({ profile });
  } catch (e) { next(e); }
};

const updateProfile = async (req, res, next) => {
  try {
    const profile = await floristService.updateProfile(req.user.id, req.body);
    res.status(200).json({ message: 'Profile updated', profile });
  } catch (e) { next(e); }
};

const toggleAvailability = async (req, res, next) => {
  try {
    const profile = await floristService.toggleAvailability(req.user.id);
    res.status(200).json({
      message: `Availability set to ${profile.isAvailable ? 'available' : 'unavailable'}`,
      profile,
    });
  } catch (e) { next(e); }
};

const listProducts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const result = await floristService.listProducts(req.query, page, limit);
    res.status(200).json(result);
  } catch (e) { next(e); }
};

const updateProductStock = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new AppError('quantity must be a non-negative integer', 400);
    }
    const product = await floristService.updateProductStock(
      req.params.productId, quantity, req.user.id
    );
    res.status(200).json({ message: 'Stock updated', product });
  } catch (e) { next(e); }
};

const getMyOrders = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const result = await floristService.getMyOrders(req.user.id, req.query, page, limit);
    res.status(200).json(result);
  } catch (e) { next(e); }
};

const getDashboard = async (req, res, next) => {
  try {
    const dashboard = await floristService.getDashboard(req.user.id);
    res.status(200).json(dashboard);
  } catch (e) { next(e); }
};

module.exports = {
  getProfile, updateProfile, toggleAvailability,
  listProducts, updateProductStock,
  getMyOrders, getDashboard,
};