/**
 * Database-backed API tests (real Express app + real MongoDB, no mocked security layers).
 * Skipped automatically when no MongoDB is available (see tests/helpers/global-setup.js).
 */
const request = require('supertest');
const mongoose = require('mongoose');
const Stripe = require('stripe');
const app = require('../../src/app');
const { describeDb, connect, disconnect, bearer } = require('../helpers/db');

const User = require('../../src/models/User');
const Category = require('../../src/models/Category');
const Product = require('../../src/models/Product');
const Coupon = require('../../src/models/Coupon');
const Payment = require('../../src/models/Payment');
const Order = require('../../src/models/Order');
const FloristProfile = require('../../src/models/FloristProfile');
const Conversation = require('../../src/models/Conversation');
const Message = require('../../src/models/Message');
const ChatbotSession = require('../../src/models/ChatbotSession');
const chatbotService = require('../../src/modules/chatbot/chatbot.service');
const { assertSessionStillValid } = require('../../src/modules/chat/chat.socket');

const mkUser = (role, n) =>
  User.create({ name: `${role} ${n}`, email: `${role}${n}@example.com`, password: 'Password123', role });

const deliveryBody = () => ({
  recipientName: 'Recipient', recipientPhone: '+201001234567', addressLine1: '1 Test Street', city: 'Cairo',
  deliveryDate: new Date(Date.now() + 2 * 864e5).toISOString(), slot: '09:00-12:00',
});

describeDb('API (database-backed)', () => {
  let admin; let alice; let bob; let florist; let product; let category;

  beforeAll(async () => {
    await connect();
    admin = await mkUser('admin', 1);
    alice = await mkUser('customer', 1);
    bob = await mkUser('customer', 2);
    florist = await mkUser('florist', 1);
    await FloristProfile.create({ user: florist._id, approvalStatus: 'PENDING' });
    category = await Category.create({ name: 'roses', slug: 'roses' });
    product = await Product.create({
      title: 'Red Roses', slug: 'red-roses', description: 'A dozen red roses for you', category: category._id,
      price: 100, stockQuantity: 50,
    });
  });
  afterAll(disconnect);

  const placeOrder = (user, body = {}) =>
    request(app).post('/api/v1/orders').set(bearer(user)).send({
      items: [{ productId: String(product._id), quantity: 1 }],
      delivery: deliveryBody(), paymentMethod: 'COD', ...body,
    });

  describe('authentication', () => {
    test('registration ignores a client-supplied role and never returns the password', async () => {
      const res = await request(app).post('/api/v1/auth/register')
        .send({ name: 'Mallory', email: 'mallory@example.com', password: 'Password123', role: 'admin' });
      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('customer');
      expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[aby]\$/i);
      expect((await User.findOne({ email: 'mallory@example.com' })).role).toBe('customer');
    });

    test('duplicate e-mail -> 409', async () => {
      const res = await request(app).post('/api/v1/auth/register')
        .send({ name: 'Alice Two', email: 'customer1@example.com', password: 'Password123' });
      expect(res.status).toBe(409);
    });

    test('login: wrong password and unknown e-mail give the same 401 message', async () => {
      const a = await request(app).post('/api/v1/auth/login').send({ email: 'customer1@example.com', password: 'WrongPass123' });
      const b = await request(app).post('/api/v1/auth/login').send({ email: 'ghost@example.com', password: 'WrongPass123' });
      expect(a.status).toBe(401);
      expect(b.status).toBe(401);
      expect(a.body.message).toBe(b.body.message);
    });

    test('NoSQL operator in login e-mail is rejected', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
      expect(res.status).toBe(422);
    });

    test('login success returns a usable token; logout invalidates it', async () => {
      const login = await request(app).post('/api/v1/auth/login').send({ email: 'customer2@example.com', password: 'Password123' });
      expect(login.status).toBe(200);
      const token = login.body.data.token;
      expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(200);
      expect((await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`)).status).toBe(200);
      expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    });

    test('change-password invalidates previously issued tokens', async () => {
      const u = await mkUser('customer', 90);
      const old = bearer(u);
      const res = await request(app).patch('/api/v1/auth/change-password').set(old)
        .send({ currentPassword: 'Password123', newPassword: 'NewPassword456' });
      expect(res.status).toBe(200);
      expect((await request(app).get('/api/v1/auth/me').set(old)).status).toBe(401);
      expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.data.token}`)).status).toBe(200);
    });

    test('a deactivated user is locked out immediately', async () => {
      const u = await mkUser('customer', 91);
      const h = bearer(u);
      await User.updateOne({ _id: u._id }, { isActive: false });
      expect((await request(app).get('/api/v1/auth/me').set(h)).status).toBe(403);
    });

    test('PATCH /auth/me cannot change role / e-mail (mass assignment)', async () => {
      const u = await mkUser('customer', 92);
      const res = await request(app).patch('/api/v1/auth/me').set(bearer(u)).send({ name: 'Renamed User', role: 'admin', email: 'x@y.com' });
      expect(res.status).toBe(200);
      const fresh = await User.findById(u._id);
      expect(fresh.role).toBe('customer');
      expect(fresh.email).toBe('customer92@example.com');
    });
  });

  describe('function-level authorization (BFLA)', () => {
    test.each([
      ['get', '/api/v1/admin/users'], ['get', '/api/v1/inventory'], ['get', '/api/v1/coupons'], ['get', '/api/v1/payments'],
      ['get', '/api/v1/admin/logs'], ['get', '/api/v1/orders'], ['get', '/api/v1/chat/presence/online'],
    ])('customer cannot %s %s', async (m, url) => {
      expect((await request(app)[m](url).set(bearer(alice))).status).toBe(403);
    });

    test('customer cannot promote themselves or change order status', async () => {
      expect((await request(app).patch(`/api/v1/admin/users/${alice._id}/role`).set(bearer(alice)).send({ role: 'admin' })).status).toBe(403);
      const o = await placeOrder(alice);
      expect((await request(app).patch(`/api/v1/orders/${o.body.data.order._id}/status`).set(bearer(alice)).send({ status: 'DELIVERED' })).status).toBe(403);
    });

    test('pending florist is blocked from florist functionality', async () => {
      expect((await request(app).get('/api/v1/florist/dashboard').set(bearer(florist))).status).toBe(403);
      expect((await request(app).get('/api/v1/orders/florist/queue').set(bearer(florist))).status).toBe(403);
    });

    test('admin cannot change their own role or deactivate themselves', async () => {
      expect((await request(app).patch(`/api/v1/admin/users/${admin._id}/role`).set(bearer(admin)).send({ role: 'customer' })).status).toBe(409);
      expect((await request(app).patch(`/api/v1/admin/users/${admin._id}/block`).set(bearer(admin)).send({})).status).toBe(409);
    });
  });

  describe('orders: object-level authorization and server-side pricing', () => {
    test('prices come from the server; client-supplied price/total are ignored', async () => {
      const res = await placeOrder(alice, { total: 1 });
      expect(res.status).toBe(201);
      expect(res.body.data.order.subtotal).toBe(100);
      expect(res.body.data.order.total).toBe(140);
    });

    test("another customer cannot read, track or cancel Alice's order (404, not 403)", async () => {
      const o = (await placeOrder(alice)).body.data.order._id;
      for (const [m, u] of [['get', `/${o}`], ['get', `/${o}/track`], ['patch', `/${o}/cancel`]]) {
        expect((await request(app)[m](`/api/v1/orders${u}`).set(bearer(bob)).send({})).status).toBe(404);
      }
    });

    test('malformed order id -> 422, unknown id -> 404', async () => {
      expect((await request(app).get('/api/v1/orders/not-an-id').set(bearer(alice))).status).toBe(422);
      expect((await request(app).get(`/api/v1/orders/${new mongoose.Types.ObjectId()}`).set(bearer(alice))).status).toBe(404);
    });

    test('insufficient stock -> 409 and nothing stays reserved', async () => {
      const p = await Product.create({ title: 'Rare', slug: 'rare', description: 'Only two in stock', category: category._id, price: 10, stockQuantity: 2 });
      const res = await request(app).post('/api/v1/orders').set(bearer(alice))
        .send({ items: [{ productId: String(p._id), quantity: 3 }], delivery: deliveryBody(), paymentMethod: 'COD' });
      expect(res.status).toBe(409);
      expect((await Product.findById(p._id)).reservedQuantity).toBe(0);
    });

    test('cancelling releases the reservation; cancelling twice -> 409', async () => {
      const before = (await Product.findById(product._id)).reservedQuantity;
      const o = (await placeOrder(alice)).body.data.order._id;
      expect((await Product.findById(product._id)).reservedQuantity).toBe(before + 1);
      expect((await request(app).patch(`/api/v1/orders/${o}/cancel`).set(bearer(alice)).send({})).status).toBe(200);
      expect((await Product.findById(product._id)).reservedQuantity).toBe(before);
      expect((await request(app).patch(`/api/v1/orders/${o}/cancel`).set(bearer(alice)).send({})).status).toBe(409);
    });

    test('illegal status transition -> 409', async () => {
      const o = (await placeOrder(alice)).body.data.order._id;
      expect((await request(app).patch(`/api/v1/orders/${o}/status`).set(bearer(admin)).send({ status: 'DELIVERED' })).status).toBe(409);
    });

    test('a paid order cannot be flipped to FAILED through the manual payment endpoint', async () => {
      const o = (await placeOrder(alice, { paymentMethod: 'ONLINE' })).body.data.order._id;
      expect((await request(app).patch(`/api/v1/orders/${o}/payment`).set(bearer(admin)).send({ paymentStatus: 'PAID' })).status).toBe(200);
      expect((await request(app).patch(`/api/v1/orders/${o}/payment`).set(bearer(admin)).send({ paymentStatus: 'FAILED' })).status).toBe(409);
    });
  });

  describe('coupons', () => {
    test('a single-use coupon can only be redeemed once under concurrent checkout', async () => {
      await Coupon.create({
        code: 'ONCE', discountType: 'FIXED', discountValue: 10, startDate: new Date(Date.now() - 1e5),
        expiryDate: new Date(Date.now() + 1e9), usageLimit: 1, createdBy: admin._id,
      });
      const results = await Promise.all([placeOrder(alice, { couponCode: 'ONCE' }), placeOrder(bob, { couponCode: 'ONCE' })]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect((await Coupon.findOne({ code: 'ONCE' })).usedCount).toBe(1);
    });

    test('per-customer limit is enforced for concurrent requests by the same customer', async () => {
      await Coupon.create({
        code: 'PERUSER', discountType: 'FIXED', discountValue: 5, startDate: new Date(Date.now() - 1e5),
        expiryDate: new Date(Date.now() + 1e9), usageLimitPerCustomer: 1, createdBy: admin._id,
      });
      const results = await Promise.all([placeOrder(bob, { couponCode: 'PERUSER' }), placeOrder(bob, { couponCode: 'PERUSER' })]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses[0]).toBe(201);
      expect(statuses[1]).toBeGreaterThanOrEqual(400); // 400 (validated first) or 409 (lost the atomic redeem race)
      expect((await Coupon.findOne({ code: 'PERUSER' })).usedCount).toBe(1);
    });
  });

  describe('payments and Stripe webhook', () => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const send = (event) => {
      const payload = JSON.stringify(event);
      const header = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
      return request(app).post('/api/v1/payments/webhook/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', header).send(payload);
    };
    const onlineOrderWithPayment = async (user, intentId, status = 'CREATED') => {
      const o = (await placeOrder(user, { paymentMethod: 'ONLINE' })).body.data.order;
      const payment = await Payment.create({
        order: o._id, customer: user._id, provider: 'STRIPE', method: 'CARD', providerIntentId: intentId,
        providerChargeId: `ch_${intentId}`, amount: o.total, status,
      });
      return { order: o, payment };
    };

    test("Alice cannot read Bob's payment nor start a payment on his order", async () => {
      const { order } = await onlineOrderWithPayment(bob, 'pi_bola');
      expect((await request(app).get(`/api/v1/payments/order/${order._id}`).set(bearer(alice))).status).toBe(403);
      expect((await request(app).post('/api/v1/payments/initiate').set(bearer(alice)).send({ orderId: order._id })).status).toBe(403);
    });

    test('client secret is never returned by the payment read endpoint', async () => {
      const { order, payment } = await onlineOrderWithPayment(bob, 'pi_secret');
      await Payment.updateOne({ _id: payment._id }, { clientSecret: 'pi_secret_SECRET' });
      const res = await request(app).get(`/api/v1/payments/order/${order._id}`).set(bearer(bob));
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain('pi_secret_SECRET');
    });

    test('payment_intent.succeeded marks order PAID; the same event replayed is ignored', async () => {
      const { order } = await onlineOrderWithPayment(alice, 'pi_ok');
      const evt = { id: 'evt_ok', type: 'payment_intent.succeeded', data: { object: { id: 'pi_ok', amount_received: order.total * 100, latest_charge: 'ch_pi_ok' } } };
      expect((await send(evt)).body.processed).toBe(true);
      expect((await Order.findById(order._id)).paymentStatus).toBe('PAID');
      expect((await send(evt)).body).toMatchObject({ skipped: true });
    });

    test('amount mismatch is not treated as paid', async () => {
      const { order } = await onlineOrderWithPayment(alice, 'pi_bad');
      await send({ id: 'evt_bad', type: 'payment_intent.succeeded', data: { object: { id: 'pi_bad', amount_received: 100, latest_charge: 'ch_pi_bad' } } });
      expect((await Order.findById(order._id)).paymentStatus).toBe('PENDING');
      expect((await Payment.findOne({ providerIntentId: 'pi_bad' })).status).toBe('FAILED');
    });

    test('regression: a late payment_failed event cannot downgrade a succeeded payment', async () => {
      await onlineOrderWithPayment(alice, 'pi_late', 'SUCCEEDED');
      const res = await send({ id: 'evt_late', type: 'payment_intent.payment_failed', data: { object: { id: 'pi_late', last_payment_error: { message: 'x'.repeat(500) } } } });
      expect(res.status).toBe(200);
      expect((await Payment.findOne({ providerIntentId: 'pi_late' })).status).toBe('SUCCEEDED');
    });

    test('regression: a stale charge.refunded event cannot lower the recorded refund', async () => {
      const { payment } = await onlineOrderWithPayment(alice, 'pi_ref', 'PARTIALLY_REFUNDED');
      await Payment.updateOne({ _id: payment._id }, { refundedAmount: 100 });
      await send({ id: 'evt_ref', type: 'charge.refunded', data: { object: { id: 'ch_pi_ref', amount_refunded: 5000 } } });
      expect((await Payment.findById(payment._id)).refundedAmount).toBe(100);
    });

    test('unknown intent -> 200 skipped (no crash, no information leak)', async () => {
      const res = await send({ id: 'evt_unk', type: 'payment_intent.succeeded', data: { object: { id: 'pi_nope', amount_received: 1 } } });
      expect(res.status).toBe(200);
      expect(res.body.skipped).toBe(true);
    });

    test('refund is admin-only and validates the amount', async () => {
      const { order } = await onlineOrderWithPayment(alice, 'pi_adm', 'SUCCEEDED');
      expect((await request(app).post(`/api/v1/payments/order/${order._id}/refund`).set(bearer(alice)).send({})).status).toBe(403);
      expect((await request(app).post(`/api/v1/payments/order/${order._id}/refund`).set(bearer(admin)).send({ amount: -5 })).status).toBe(422);
      expect((await request(app).post(`/api/v1/payments/order/${order._id}/refund`).set(bearer(admin)).send({ amount: 999999 })).status).toBe(400);
    });
  });

  describe('chat isolation', () => {
    test('regression: REST message history exposes no reader identities to customers', async () => {
      const conv = await Conversation.create({ customer: alice._id, florist: florist._id, subject: 'Order help' });
      await Message.create({
        conversation: conv._id, author: admin._id, authorSide: 'ADMIN', body: 'hello both', visibleTo: ['ADMIN', 'CUSTOMER', 'FLORIST'],
        readBy: [{ user: florist._id, side: 'FLORIST' }, { user: alice._id, side: 'CUSTOMER' }],
      });
      const res = await request(app).get(`/api/v1/chat/conversations/${conv._id}/messages`).set(bearer(alice));
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(String(florist._id));
    });

    test("Bob cannot read, list or delete Alice's conversation", async () => {
      const conv = await Conversation.create({ customer: alice._id, subject: 'Private' });
      expect((await request(app).get(`/api/v1/chat/conversations/${conv._id}/messages`).set(bearer(bob))).status).toBe(404);
      expect((await request(app).delete(`/api/v1/chat/conversations/${conv._id}`).set(bearer(bob))).status).toBe(404);
      const list = await request(app).get('/api/v1/chat/conversations').set(bearer(bob));
      expect(list.body.items.map((c) => String(c._id))).not.toContain(String(conv._id));
    });

    test('regression: a live socket is rejected once its session is revoked', async () => {
      const u = await mkUser('customer', 93);
      const socket = { data: { user: { id: String(u._id), role: 'customer' }, tokenVersion: 0, sessionCheckedAt: 0 }, disconnect: jest.fn() };
      await expect(assertSessionStillValid(socket)).resolves.toBeUndefined();
      await User.updateOne({ _id: u._id }, { $inc: { tokenVersion: 1 } });
      socket.data.sessionCheckedAt = 0;
      await expect(assertSessionStillValid(socket)).rejects.toMatchObject({ statusCode: 401 });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('chatbot', () => {
    test('regression: the transcript stays bounded and only one active session exists', async () => {
      const u = await mkUser('customer', 94);
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      for (let i = 0; i < ChatbotSession.MAX_MESSAGES / 2 + 5; i += 1) await chatbotService.sendMessage(String(u._id), `zzz ${i}`);
      spy.mockRestore();
      const sessions = await ChatbotSession.find({ customer: u._id, status: 'ACTIVE' });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].messages.length).toBeLessThanOrEqual(ChatbotSession.MAX_MESSAGES);
    });

    test('chatbot is customer-only', async () => {
      expect((await request(app).post('/api/v1/chatbot/messages').set(bearer(admin)).send({ message: 'hi' })).status).toBe(403);
    });
  });

  describe('support tickets', () => {
    test("a customer cannot open another customer's ticket", async () => {
      const created = await request(app).post('/api/v1/support/tickets').set(bearer(alice)).send({ subject: 'Help me', message: 'Where is it?' });
      expect(created.status).toBe(201);
      const id = created.body.data.ticket._id;
      expect((await request(app).get(`/api/v1/support/tickets/${id}`).set(bearer(bob))).status).toBe(404);
      expect((await request(app).post(`/api/v1/support/tickets/${id}/messages`).set(bearer(bob)).send({ message: 'hi' })).status).toBe(404);
    });

    test('a customer cannot attach a ticket to somebody else\'s order', async () => {
      const o = (await placeOrder(alice)).body.data.order._id;
      const res = await request(app).post('/api/v1/support/tickets').set(bearer(bob)).send({ subject: 'Not mine', message: 'x', orderId: o });
      expect(res.status).toBe(404);
    });
  });
});
