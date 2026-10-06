const express = require("express");
const router = express.Router();

const categoryController = require("./category.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const { allowRoles } = require("../../middleware/role.middleware");

const adminOnly = [authMiddleware, allowRoles("admin")];

router.post("/", ...adminOnly, categoryController.createCategory);

router.patch(
  "/:id/status",
  ...adminOnly,
  categoryController.toggleCategoryStatus,
);

router.patch("/:id/order", ...adminOnly, categoryController.updateDisplayOrder);

router.patch("/:id/restore", ...adminOnly, categoryController.restoreCategory);

router.patch("/:id", ...adminOnly, categoryController.updateCategory);

router.delete("/:id", ...adminOnly, categoryController.deleteCategory);

router.get("/", categoryController.listCategories);

router.get("/:slug", categoryController.getCategory);

module.exports = router;
