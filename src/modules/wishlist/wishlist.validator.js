const { z, objectId, pageQuery } = require('../../validators/common');

const productParams = z.object({ productId: objectId });
const listQuery = z.object({ ...pageQuery, limit: z.coerce.number().int().min(1).max(50).default(20) });

module.exports = { productParams, listQuery };
