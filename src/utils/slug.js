const slugify = require('slugify');

/** Returns a slug for `text` that is unique within `Model.slug` (appends -2, -3, ...). */
const uniqueSlug = async (Model, text, fallback = 'item') => {
  const base = slugify(String(text), { lower: true, strict: true }) || fallback;
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await Model.exists({ slug: candidate })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
};

module.exports = { uniqueSlug };
