const router = require('express').Router();
const ctrl = require('./support.controller');
const v = require('./support.validator');
const validate = require('../../middleware/validate.middleware');
const authenticate = require('../../middleware/auth.middleware');
const { allowRoles } = require('../../middleware/role.middleware');
const { ROLES } = require('../../constants');
const { userLimiter } = require('../../middleware/rateLimit.middleware');

const ticketLimiter = userLimiter({ windowMs: 60 * 60 * 1000, limit: 10, message: 'Too many tickets created. Try again later.' });
const messageLimiter = userLimiter({ windowMs: 60 * 1000, limit: 20, message: 'You are sending messages too fast. Please slow down.' });

// Customers and florists can ONLY talk to the admin team, and only inside their own tickets.
// (Florists are allowed regardless of approval status so a pending florist can ask about verification.)
router.use(authenticate, allowRoles(ROLES.CUSTOMER, ROLES.FLORIST));

router.post('/tickets', ticketLimiter, validate({ body: v.createTicket }), ctrl.createTicket);
router.get('/tickets', validate({ query: v.myList }), ctrl.listMine);
router.get('/tickets/:id', validate({ params: v.idParams }), ctrl.getMine);
router.post('/tickets/:id/messages', messageLimiter, validate({ params: v.idParams, body: v.message }), ctrl.addMyMessage);

module.exports = router;
