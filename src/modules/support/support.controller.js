const service = require('./support.service');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const { logAction } = require('../admin/adminLog.service');

// ---- Customer / Florist -> Admin ----
const createTicket = asyncHandler(async (req, res) => {
  const ticket = await service.createTicket(req.user, req.body);
  sendSuccess(res, { status: 201, message: 'Your message was sent to the admin team', data: { ticket } });
});

const listMine = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;
  sendSuccess(res, { data: await service.listMyTickets(req.user.id, filters, page, limit) });
});

const getMine = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { ticket: await service.getMyTicket(req.params.id, req.user.id) } });
});

const addMyMessage = asyncHandler(async (req, res) => {
  const ticket = await service.addMyMessage(req.params.id, req.user, req.body.message);
  sendSuccess(res, { message: 'Message sent', data: { ticket } });
});

// ---- Admin <-> Customer / Florist ----
const adminList = asyncHandler(async (req, res) => {
  const { page, limit, ...filters } = req.query;
  sendSuccess(res, { data: await service.adminList(filters, page, limit) });
});

const adminGet = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { ticket: await service.adminGet(req.params.id) } });
});

const adminCreate = asyncHandler(async (req, res) => {
  const ticket = await service.adminCreate(req.user, req.body);
  logAction(req, 'SUPPORT_TICKET_CREATED', 'SUPPORT', ticket._id, { note: `To ${ticket.participantRole}` });
  sendSuccess(res, { status: 201, message: 'Ticket created', data: { ticket } });
});

const adminReply = asyncHandler(async (req, res) => {
  const ticket = await service.adminReply(req.params.id, req.user, req.body.message);
  logAction(req, 'SUPPORT_TICKET_REPLIED', 'SUPPORT', ticket._id);
  sendSuccess(res, { message: 'Reply sent', data: { ticket } });
});

const adminUpdate = asyncHandler(async (req, res) => {
  const ticket = await service.adminUpdate(req.params.id, req.body);
  logAction(req, 'SUPPORT_TICKET_UPDATED', 'SUPPORT', ticket._id, { after: { status: ticket.status, priority: ticket.priority } });
  sendSuccess(res, { message: 'Ticket updated', data: { ticket } });
});

module.exports = { createTicket, listMine, getMine, addMyMessage, adminList, adminGet, adminCreate, adminReply, adminUpdate };
