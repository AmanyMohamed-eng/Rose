const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replace a property on the request. Express 5 defines `req.query` as a getter-only accessor on the
 * prototype, so a plain `req.query = x` is silently ignored. Defining an own property works on 4 and 5.
 */
const setRequestProp = (req, key, value) => {
  Object.defineProperty(req, key, { value, writable: true, configurable: true, enumerable: true });
};

module.exports = { round2, escapeRegex, setRequestProp };
