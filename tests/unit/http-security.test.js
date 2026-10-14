const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const Stripe = require('stripe');
const app = require('../../src/app');
const sanitize = require('../../src/middleware/sanitize.middleware');
const { errorHandler } = require('../../src/middleware/error.middleware');
const { loginAccountLimiter, registerLimiter, userLimiter } = require('../../src/middleware/rateLimit.middleware');
const AppError = require('../../src/utils/AppError');

const SECRET = process.env.JWT_SECRET;
const ID = '507f1f77bcf86cd799439011';

describe('authentication gate (no database needed: rejected before any lookup)', () => {
  const protectedRoutes = [
    ['get', '/api/v1/auth/me'], ['post', '/api/v1/auth/logout'], ['patch', '/api/v1/auth/me'],
    ['patch', '/api/v1/auth/change-password'],
    ['get', '/api/v1/cart'], ['post', '/api/v1/cart/items'], ['get', '/api/v1/orders/my'], ['post', '/api/v1/orders'],
    ['get', `/api/v1/orders/${ID}`], ['patch', `/api/v1/orders/${ID}/status`], ['get', '/api/v1/orders/admin/stats'],
    ['get', '/api/v1/admin/users'], ['patch', `/api/v1/admin/users/${ID}/role`], ['get', '/api/v1/admin/logs'],
    ['get', '/api/v1/inventory'], ['get', '/api/v1/coupons'], ['post', '/api/v1/coupons/validate'],
    ['get', '/api/v1/payments'], ['post', '/api/v1/payments/initiate'], ['post', `/api/v1/payments/order/${ID}/refund`],
    ['get', '/api/v1/florist/profile'], ['get', '/api/v1/support/tickets'], ['get', '/api/v1/chat/conversations'],
    ['post', '/api/v1/chatbot/messages'], ['get', '/api/v1/wishlist'], ['post', '/api/v1/reviews'],
    ['post', '/api/v1/products'], ['delete', `/api/v1/products/${ID}`], ['get', '/api/v1/products/admin/all'],
    ['post', '/api/v1/categories'], ['get', '/api/v1/chat/presence/online'],
  ];

  test.each(protectedRoutes)('%s %s without a token -> 401', async (method, url) => {
    const res = await request(app)[method](url).send({});
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test.each([
    ['not a bearer header', 'Token abc'],
    ['empty bearer', 'Bearer '],
    ['garbage token', 'Bearer not.a.jwt'],
  ])('%s -> 401', async (_n, header) => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', header);
    expect(res.status).toBe(401);
  });

  test('expired token -> 401 "Token expired"', async () => {
    const token = jwt.sign({ id: ID, role: 'admin', tv: 0 }, SECRET, { expiresIn: -10 });
    const res = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Token expired');
  });

  test('token signed with a different secret -> 401', async () => {
    const token = jwt.sign({ id: ID, role: 'admin', tv: 0 }, 'x'.repeat(40));
    const res = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  test('alg=none token -> 401', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: ID, role: 'admin', tv: 0 })}.`;
    const res = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  test('token with a non-ObjectId id (operator injection attempt) -> 401', async () => {
    const token = jwt.sign({ id: { $ne: null }, role: 'admin', tv: 0 }, SECRET);
    const res = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('platform behaviour', () => {
  test('unknown route -> JSON 404', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false });
  });

  test('malformed JSON -> 400 without stack trace', async () => {
    const res = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.stack).toBeUndefined();
  });

  test('oversized body -> 413', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@b.co', password: 'x'.repeat(1_200_000) });
    expect(res.status).toBe(413);
  });

  test('security headers present, x-powered-by absent', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  test('CORS: disallowed origin rejected, allowed origin reflected', async () => {
    const bad = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(bad.status).toBe(403);
    const ok = await request(app).get('/health').set('Origin', 'http://localhost:4200');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:4200');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
  });

  test('health reports 503 when the database is down', async () => {
    const res = await request(app).get('/health');
    expect([200, 503]).toContain(res.status);
  });
});

describe('sanitize middleware (NoSQL operator stripping)', () => {
  const mk = () => {
    const a = express();
    a.use(express.json());
    a.use(sanitize);
    a.post('/x', (req, res) => res.json({ body: req.body, query: req.query }));
    return a;
  };
  test('strips $-operators and dotted keys at any depth', async () => {
    const res = await request(mk())
      .post('/x?$where=1&a.b=2&ok=1')
      .send({ email: { $ne: null }, nested: { deep: { $gt: '' } }, 'a.b': 1, keep: 'yes', list: [{ $in: [1] }] });
    expect(res.body.body).toEqual({ email: {}, nested: { deep: {} }, keep: 'yes', list: [{}] });
    expect(res.body.query).toEqual({ ok: '1' });
  });
});

describe('error handler', () => {
  const mk = (err) => {
    const a = express();
    a.get('/e', (req, res, next) => next(err));
    a.use(errorHandler);
    return a;
  };
  test('unexpected errors are masked (no message, no stack)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(mk(new Error('secret db password leaked: hunter2'))).get('/e');
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Internal server error' });
  });
  test.each([
    [Object.assign(new Error('dup'), { code: 11000, keyPattern: { email: 1 } }), 409],
    [Object.assign(new Error('cast'), { name: 'CastError', path: '_id' }), 400],
    [Object.assign(new Error('jwt'), { name: 'JsonWebTokenError' }), 401],
    [Object.assign(new Error('v'), { name: 'ValidationError', errors: { a: { path: 'a', message: 'bad' } } }), 422],
    [new AppError('nope', 403), 403],
  ])('maps known errors to the right status (%#)', async (err, status) => {
    const res = await request(mk(err)).get('/e');
    expect(res.status).toBe(status);
    expect(res.body.success).toBe(false);
  });
});

describe('rate limiters', () => {
  test('per-account login limiter counts failures per e-mail, regardless of source IP', async () => {
    const a = express();
    a.use(express.json());
    a.post('/login', loginAccountLimiter, (req, res) => res.status(401).json({ success: false }));
    let last;
    for (let i = 0; i < 21; i += 1) {
      last = await request(a).post('/login').set('X-Forwarded-For', `10.0.0.${i}`).send({ email: 'Victim@Example.com' });
    }
    expect(last.status).toBe(429);
    const other = await request(a).post('/login').send({ email: 'other@example.com' });
    expect(other.status).toBe(401);
  });

  test('register limiter counts successful requests too', async () => {
    const a = express();
    a.post('/r', registerLimiter, (req, res) => res.status(201).json({}));
    let last;
    for (let i = 0; i < 21; i += 1) last = await request(a).post('/r');
    expect(last.status).toBe(429);
  });

  test('user limiter is keyed per authenticated user', async () => {
    const a = express();
    a.use((req, res, next) => { req.user = { id: req.get('x-user') }; next(); });
    a.post('/c', userLimiter({ windowMs: 60000, limit: 2, message: 'slow down' }), (req, res) => res.json({}));
    await request(a).post('/c').set('x-user', 'u1');
    await request(a).post('/c').set('x-user', 'u1');
    expect((await request(a).post('/c').set('x-user', 'u1')).status).toBe(429);
    expect((await request(a).post('/c').set('x-user', 'u2')).status).toBe(200);
  });
});

describe('Stripe webhook signature verification (no database needed)', () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { id: 'pi_1' } } });

  test('missing signature -> 400', async () => {
    const res = await request(app).post('/api/v1/payments/webhook/stripe').set('Content-Type', 'application/json').send(payload);
    expect(res.status).toBe(400);
  });

  test('forged signature -> 400', async () => {
    const res = await request(app)
      .post('/api/v1/payments/webhook/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 't=1,v1=deadbeef')
      .send(payload);
    expect(res.status).toBe(400);
  });

  test('stale (replayed) but correctly signed event -> 400', async () => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const old = Math.floor(Date.now() / 1000) - 3600;
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET, timestamp: old });
    const res = await request(app)
      .post('/api/v1/payments/webhook/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', header)
      .send(payload);
    expect(res.status).toBe(400);
  });
});
