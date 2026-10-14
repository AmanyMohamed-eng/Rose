// Defence-in-depth against NoSQL operator injection: strips keys beginning
// with "$" or containing "." from body/query/params (zod validation is the primary guard).
const { setRequestProp } = require('../utils/helpers');

const isPlainObject = (value) => {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  // Express 5's query parser returns null-prototype objects, so accept those too.
  return proto === Object.prototype || proto === null;
};

const clean = (value) => {
  if (Array.isArray(value)) return value.map(clean);
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$') || k.includes('.')) continue;
      out[k] = clean(v);
    }
    return out;
  }
  return value;
};

const sanitize = (req, res, next) => {
  if (req.body) setRequestProp(req, 'body', clean(req.body));
  if (req.query) setRequestProp(req, 'query', clean(req.query));
  if (req.params) setRequestProp(req, 'params', clean(req.params));
  next();
};

module.exports = sanitize;
