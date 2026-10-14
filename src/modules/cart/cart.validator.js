const { z, objectId } = require('../../validators/common');

const quantity = z.number({ message: 'Quantity must be a positive integer' }).int('Quantity must be a positive integer').min(1, 'Quantity must be a positive integer').max(100, 'Quantity cannot exceed 100');

const addProduct = z.object({ productId: objectId, quantity });
const updateQuantity = z.object({ quantity });
const productParams = z.object({ productId: objectId });

module.exports = { addProduct, updateQuantity, productParams };
