const router = require('express').Router();
const ctrl = require('./admin.controller');
const support = require('../support/support.controller');
const v = require('./admin.validator');
const sv = require('../support/support.validator');
const validate = require('../../middleware/validate.middleware');
const authenticate = require('../../middleware/auth.middleware');
const { allowRoles } = require('../../middleware/role.middleware');
const { ROLES } = require('../../constants');

// Everything below is ADMIN ONLY.
router.use(authenticate, allowRoles(ROLES.ADMIN));

router.get('/stats', ctrl.getStats);
router.get('/logs', validate({ query: v.logsQuery }), ctrl.listLogs);
router.get('/profile', ctrl.getProfile);
router.patch('/profile', validate({ body: v.updateProfile }), ctrl.updateProfile);

// ---- Users (customers / florists / admins) ----
router.get('/users', validate({ query: v.listUsers }), ctrl.listUsers);
router.get('/users/:id', validate({ params: v.idParams }), ctrl.getUser);
router.patch('/users/:id/role', validate({ params: v.idParams, body: v.updateRole }), ctrl.updateUserRole);
router.patch('/users/:id/block', validate({ params: v.idParams, body: v.setActive }), ctrl.deactivateUser);
router.patch('/users/:id/unblock', validate({ params: v.idParams, body: v.setActive }), ctrl.activateUser);
router.patch('/users/:id', validate({ params: v.idParams, body: v.updateUser }), ctrl.updateUser);

// ---- Florists (:id is the florist's USER id) ----
router.get('/florists', validate({ query: v.listFlorists }), ctrl.listFlorists);
router.post('/florists', validate({ body: v.createFlorist }), ctrl.createFlorist);
router.get('/florists/:id', validate({ params: v.idParams }), ctrl.getFlorist);
router.patch('/florists/:id/approve', validate({ params: v.idParams }), ctrl.approveFlorist);
router.patch('/florists/:id/reject', validate({ params: v.idParams, body: v.rejectFlorist }), ctrl.rejectFlorist);
router.patch('/florists/:id/profile', validate({ params: v.idParams, body: v.updateFloristProfile }), ctrl.updateFloristProfile);

// ---- Mediation: the admin is the ONLY bridge between customers and florists ----
router.get('/support/tickets', validate({ query: sv.adminList }), support.adminList);
router.post('/support/tickets', validate({ body: sv.adminCreate }), support.adminCreate);
router.get('/support/tickets/:id', validate({ params: sv.idParams }), support.adminGet);
router.post('/support/tickets/:id/messages', validate({ params: sv.idParams, body: sv.message }), support.adminReply);
router.patch('/support/tickets/:id', validate({ params: sv.idParams, body: sv.adminUpdate }), support.adminUpdate);

module.exports = router;
