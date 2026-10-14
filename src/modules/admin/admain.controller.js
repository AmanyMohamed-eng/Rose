const { logAction } = require('./adminLog.service');

const updateUserRole = async (req, res, next) => {
  try {
    const target = await userAdminService.getUser(req.params.id);
    const before = { role: target.user.role };

    const user = await userAdminService.updateUserRole(req.params.id, req.body.role);

    logAction(req, 'USER_ROLE_CHANGED', 'USER', user._id, {
      before,
      after: { role: user.role },
    });

    res.status(200).json({ message: 'Role updated', user });
  } catch (e) { next(e); }
};

const deleteCategory = async (req, res, next) => {
  try {
    const target = await Category.findById(req.params.id).lean();
    await categoryAdminService.deleteCategory(req.params.id);

    logAction(req, 'CATEGORY_DELETED', 'CATEGORY', req.params.id, {
      before: target,
      note: `Deleted category "${target?.name}"`,
    });

    res.status(204).send();
  } catch (e) { next(e); }
};