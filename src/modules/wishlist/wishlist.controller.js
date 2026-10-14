const service = require('./wishlist.service');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');

const addProduct = asyncHandler(async (req, res) => {
  const wishlist = await service.addProduct(req.user.id, req.params.productId);
  sendSuccess(res, { status: 201, message: 'Added to wishlist', data: { wishlist } });
});

const removeProduct = asyncHandler(async (req, res) => {
  const wishlist = await service.removeProduct(req.user.id, req.params.productId);
  sendSuccess(res, { message: 'Removed from wishlist', data: { wishlist } });
});

const getWishlist = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await service.getWishlist(req.user.id, req.query.page, req.query.limit) });
});

const checkWishlist = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { inWishlist: await service.checkWishlist(req.user.id, req.params.productId) } });
});

const clearWishlist = asyncHandler(async (req, res) => {
  await service.clearWishlist(req.user.id);
  sendSuccess(res, { message: 'Wishlist cleared' });
});

module.exports = { addProduct, removeProduct, getWishlist, checkWishlist, clearWishlist };
