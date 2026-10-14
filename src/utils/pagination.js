const paginationMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  pages: Math.ceil(total / limit),
});

const skipFor = (page, limit) => (page - 1) * limit;

module.exports = { paginationMeta, skipFor };
