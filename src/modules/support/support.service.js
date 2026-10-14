const SupportTicket = require('../../models/SupportTicket');
const Order = require('../../models/Order');
const User = require('../../models/User');
const AppError = require('../../utils/AppError');
const { paginationMeta, skipFor } = require('../../utils/pagination');
const { ROLES } = require('../../constants');

/**
 * ADMIN MEDIATION: a ticket has exactly one non-admin participant. Customers and florists can only
 * ever read/write tickets where they are that participant, so they can never reach each other —
 * every relay between them is performed by an admin who reads one thread and writes in the other.
 */

// ---------- views ----------
const participantView = (ticket) => {
  const o = ticket.toJSON();
  delete o.assignedAdmin; // staff identity is not exposed to customers/florists
  delete o.initiatedByAdmin;
  o.messages = (o.messages || []).map((m) => ({
    _id: m._id,
    from: m.senderRole === ROLES.ADMIN ? 'support' : 'me',
    body: m.body,
    createdAt: m.createdAt,
  }));
  if (o.order && o.order.orderNumber) o.order = { id: o.order._id || o.order.id, orderNumber: o.order.orderNumber, status: o.order.status };
  return o;
};

const POPULATE_ORDER = { path: 'order', select: 'orderNumber status' };

// ---------- participant (customer / florist) ----------
const assertOrderReference = async (orderId, user) => {
  if (!orderId) return null;
  const filter = { _id: orderId };
  if (user.role === ROLES.CUSTOMER) filter.customer = user.id;
  else if (user.role === ROLES.FLORIST) filter.assignedFlorist = user.id;
  const order = await Order.findOne(filter).select('_id');
  if (!order) throw new AppError('Order not found', 404);
  return order._id;
};

const createTicket = async (user, { subject, category, orderId, message }) => {
  const order = await assertOrderReference(orderId, user);
  const ticket = await SupportTicket.create({
    participant: user.id,
    participantRole: user.role,
    subject,
    category: category || (order ? 'ORDER' : 'GENERAL'),
    order,
    messages: [{ sender: user.id, senderRole: user.role, body: message }],
  });
  await ticket.populate(POPULATE_ORDER);
  return participantView(ticket);
};

const listMyTickets = async (userId, f, page, limit) => {
  const query = { participant: userId };
  if (f.status) query.status = f.status;
  const [items, total] = await Promise.all([
    SupportTicket.find(query).select('-messages').sort({ lastMessageAt: -1 }).skip(skipFor(page, limit)).limit(limit).populate(POPULATE_ORDER),
    SupportTicket.countDocuments(query),
  ]);
  return { items: items.map(participantView), pagination: paginationMeta(total, page, limit) };
};

const loadOwn = async (id, userId) => {
  const ticket = await SupportTicket.findOne({ _id: id, participant: userId }).populate(POPULATE_ORDER);
  if (!ticket) throw new AppError('Ticket not found', 404);
  return ticket;
};

const getMyTicket = async (id, userId) => participantView(await loadOwn(id, userId));

const addMyMessage = async (id, user, message) => {
  const ticket = await loadOwn(id, user.id);
  if (ticket.status === 'CLOSED') throw new AppError('This ticket is closed', 409);
  ticket.messages.push({ sender: user.id, senderRole: user.role, body: message });
  ticket.lastMessageAt = new Date();
  if (ticket.status === 'RESOLVED') ticket.status = 'OPEN'; // a reply re-opens a resolved ticket
  await ticket.save();
  return participantView(ticket);
};

// ---------- admin ----------
const adminList = async (f, page, limit) => {
  const query = {};
  for (const k of ['status', 'category', 'priority']) if (f[k]) query[k] = f[k];
  if (f.participantId) query.participant = f.participantId;
  if (f.participantRole) query.participantRole = f.participantRole;

  const [items, total] = await Promise.all([
    SupportTicket.find(query).select('-messages').sort({ lastMessageAt: -1 }).skip(skipFor(page, limit)).limit(limit)
      .populate('participant', 'name email role').populate(POPULATE_ORDER),
    SupportTicket.countDocuments(query),
  ]);
  return { items, pagination: paginationMeta(total, page, limit) };
};

const loadAny = async (id) => {
  const ticket = await SupportTicket.findById(id).populate('participant', 'name email phone role').populate(POPULATE_ORDER).populate('messages.sender', 'name role');
  if (!ticket) throw new AppError('Ticket not found', 404);
  return ticket;
};

const adminGet = async (id) => loadAny(id);

const adminCreate = async (admin, { participantId, subject, category, priority, orderId, message }) => {
  const participant = await User.findById(participantId).select('role isActive');
  if (!participant || ![ROLES.CUSTOMER, ROLES.FLORIST].includes(participant.role)) {
    throw new AppError('Participant must be an existing customer or florist', 404);
  }
  if (orderId && !(await Order.exists({ _id: orderId }))) throw new AppError('Order not found', 404);

  const ticket = await SupportTicket.create({
    participant: participant._id,
    participantRole: participant.role,
    subject,
    category: category || (orderId ? 'ORDER' : 'GENERAL'),
    priority: priority || 'NORMAL',
    order: orderId || null,
    status: 'IN_PROGRESS',
    assignedAdmin: admin.id,
    initiatedByAdmin: true,
    messages: [{ sender: admin.id, senderRole: ROLES.ADMIN, body: message }],
  });
  return loadAny(ticket._id);
};

const adminReply = async (id, admin, message) => {
  const ticket = await SupportTicket.findById(id);
  if (!ticket) throw new AppError('Ticket not found', 404);
  if (ticket.status === 'CLOSED') throw new AppError('This ticket is closed', 409);
  ticket.messages.push({ sender: admin.id, senderRole: ROLES.ADMIN, body: message });
  ticket.lastMessageAt = new Date();
  if (!ticket.assignedAdmin) ticket.assignedAdmin = admin.id;
  if (ticket.status === 'OPEN') ticket.status = 'IN_PROGRESS';
  await ticket.save();
  return loadAny(id);
};

const adminUpdate = async (id, data) => {
  const ticket = await SupportTicket.findById(id);
  if (!ticket) throw new AppError('Ticket not found', 404);
  if (data.status) ticket.status = data.status;
  if (data.priority) ticket.priority = data.priority;
  await ticket.save();
  return loadAny(id);
};

module.exports = {
  createTicket, listMyTickets, getMyTicket, addMyMessage, adminList, adminGet, adminCreate, adminReply, adminUpdate,
};
