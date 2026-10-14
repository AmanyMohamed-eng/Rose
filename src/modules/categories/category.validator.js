const { z, objectId } = require('../../validators/common');

const name = z.string().trim().min(2, 'Category name must be at least 2 characters').max(100);
const description = z.string().trim().max(300).nullable();
const image = z.string().trim().max(500).nullable();
const displayOrder = z.number().int().min(0);

const create = z.object({
  name,
  description: description.optional(),
  image: image.optional(),
  displayOrder: displayOrder.optional(),
});

const update = z
  .object({ name, description, image, displayOrder, isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required for update');

const setOrder = z.object({ displayOrder });
const idParams = z.object({ id: objectId });
const slugParams = z.object({ slug: z.string().trim().toLowerCase().min(1).max(120) });

module.exports = { create, update, setOrder, idParams, slugParams };
