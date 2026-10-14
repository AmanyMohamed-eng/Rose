const router = require('express').Router();
const ctrl = require('./auth.controller');
const v = require('./auth.validator');
const validate = require('../../middleware/validate.middleware');
const authenticate = require('../../middleware/auth.middleware');
const { authLimiter, registerLimiter, loginAccountLimiter } = require('../../middleware/rateLimit.middleware');

// Public
router.post('/register', registerLimiter, authLimiter, validate({ body: v.register }), ctrl.register);
router.post('/register/florist', registerLimiter, authLimiter, validate({ body: v.registerFlorist }), ctrl.registerFlorist);
router.post('/login', authLimiter, loginAccountLimiter, validate({ body: v.login }), ctrl.login);

// Any authenticated role (customer | florist | admin)
router.post('/logout', authenticate, ctrl.logout);
router.get('/me', authenticate, ctrl.me);
router.patch('/me', authenticate, validate({ body: v.updateMe }), ctrl.updateMe);
router.patch('/change-password', authenticate, authLimiter, validate({ body: v.changePassword }), ctrl.changePassword);

module.exports = router;
