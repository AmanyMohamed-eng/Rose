const categoryService = require('./category.service');
const {
  validateCreate,
  validateUpdate,
} = require('./category.validator');



/*
 * GET /api/v1/categories
 * Public — active categories
 */
const listCategories = async (req, res, next) => {
  try {
    const categories = await categoryService.listCategories();

    res.status(200).json({
      count: categories.length,
      categories,
    });
  } catch (error) {
    next(error);
  }
};


/*
 * GET /api/v1/categories/:slug
 * Public — category details
 */
const getCategory = async (req, res, next) => {
  try {
    const category = await categoryService.getCategoryBySlug(
      req.params.slug
    );

    res.status(200).json({
      category,
    });
  } catch (error) {
    next(error);
  }
};


/*
 * POST /api/v1/categories
 * Admin only
 */
const createCategory = async (req, res, next) => {
  try {
    validateCreate(req.body);

    const category = await categoryService.createCategory(req.body);

    res.status(201).json({
      message: 'Category created successfully',
      category,
    });
  } catch (error) {
    next(error);
  }
};

/*
 * PATCH /api/v1/categories/:id
 * Admin only
 */
const updateCategory = async (req, res, next) => {
  try {
    validateUpdate(req.body);

    const category = await categoryService.updateCategory(
      req.params.id,
      req.body
    );

    res.status(200).json({
      message: 'Category updated successfully',
      category,
    });
  } catch (error) {
    next(error);
  }
};

/*
 * DELETE /api/v1/categories/:id
 * Admin only — soft delete
 */
const deleteCategory = async (req, res, next) => {
  try {
    await categoryService.softDeleteCategory(req.params.id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};


/*
 * PATCH /api/v1/categories/:id/restore
 * Admin only — restore soft-deleted category
 */
const restoreCategory = async (req, res, next) => {
  try {
    const category = await categoryService.restoreCategory(
      req.params.id
    );

    res.status(200).json({
      message: 'Category restored successfully',
      category,
    });
  } catch (error) {
    next(error);
  }
};


/*
 * PATCH /api/v1/categories/:id/status
 * Admin only — toggle active status
 */
const toggleCategoryStatus = async (req, res, next) => {
  try {
    const category = await categoryService.toggleCategoryStatus(
      req.params.id
    );

    res.status(200).json({
      message: `Category ${
        category.isActive ? 'activated' : 'deactivated'
      } successfully`,
      category,
    });
  } catch (error) {
    next(error);
  }
};


/*
 * PATCH /api/v1/categories/:id/order
 * Admin only — update display order
 * Body: { displayOrder: number }
 */
const updateDisplayOrder = async (req, res, next) => {
  try {
    const { displayOrder } = req.body;

    if (
      displayOrder == null ||
      typeof displayOrder !== 'number' ||
      displayOrder < 0
    ) {
      return res.status(400).json({
        message: 'Valid displayOrder is required',
      });
    }

    const category = await categoryService.updateDisplayOrder(
      req.params.id,
      displayOrder
    );

    res.status(200).json({
      message: 'Category order updated successfully',
      category,
    });
  } catch (error) {
    next(error);
  }
};


module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  restoreCategory,
  toggleCategoryStatus,
  updateDisplayOrder,
};