const { z, objectId, pageQuery, boolQuery, searchText } = require('../../validators/common');
const { INVENTORY_TYPES, INVENTORY_UNITS, LOW_STOCK_THRESHOLD } = require('../../constants');

const fields = {
  name: z.string().trim().min(2).max(80),
  type: z.enum(INVENTORY_TYPES),
  unit: z.enum(INVENTORY_UNITS),
  quantity: z.number().min(0).max(1e7),
  lowStockThreshold: z.number().min(0).max(1e6),
  costPerUnit: z.number().min(0).max(1e6),
  supplier: z.string().trim().max(120),
};

const create = z.object({
  name: fields.name,
  type: fields.type,
  unit: fields.unit.optional(),
  quantity: fields.quantity.optional(),
  lowStockThreshold: fields.lowStockThreshold.default(LOW_STOCK_THRESHOLD),
  costPerUnit: fields.costPerUnit.optional(),
  supplier: fields.supplier.optional(),
});

const update = z
  .object({
    name: fields.name,
    type: fields.type,
    unit: fields.unit,
    lowStockThreshold: fields.lowStockThreshold,
    costPerUnit: fields.costPerUnit,
    supplier: fields.supplier,
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');

// Exactly one of `delta` (relative) or `quantity` (absolute).
const adjust = z
  .object({ delta: z.number().min(-1e7).max(1e7).optional(), quantity: fields.quantity.optional() })
  .refine((v) => (v.delta === undefined) !== (v.quantity === undefined), 'Provide exactly one of delta or quantity')
  .refine((v) => v.delta === undefined || v.delta !== 0, 'delta cannot be 0');

const list = z.object({
  ...pageQuery,
  type: z.enum(INVENTORY_TYPES).optional(),
  isActive: boolQuery.optional(),
  lowStock: boolQuery.optional(),
  search: searchText.optional(),
});

const idParams = z.object({ id: objectId });

module.exports = { create, update, adjust, list, idParams };
