const AppError = require('../utils/AppError');
const { setRequestProp } = require('../utils/helpers');

/**
 * validate({ body, query, params }) — each is a zod schema.
 * Parsed (and stripped) values REPLACE the originals, so unknown fields
 * (e.g. `role`, `isActive`, `stockQuantity`) never reach controllers.
 */
const validate = (schemas) => (req, res, next) => {
  const errors = [];
  for (const key of ['params', 'query', 'body']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key] === undefined ? {} : req[key]);
    if (result.success) {
      setRequestProp(req, key, result.data);
    } else {
      for (const issue of result.error.issues) {
        errors.push({ field: [key, ...issue.path].join('.'), message: issue.message });
      }
    }
  }
  if (errors.length) return next(new AppError(errors[0].message, 422, errors));
  return next();
};

module.exports = validate;
