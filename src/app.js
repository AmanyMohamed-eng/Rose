const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

const { config } = require('./config/env');
const { globalLimiter } = require('./middleware/rateLimit.middleware');
const sanitize = require('./middleware/sanitize.middleware');
const { notFound, errorHandler } = require('./middleware/error.middleware');
const AppError = require('./utils/AppError');

const authRoutes = require('./modules/auth/auth.routes');
const productRoutes = require('./modules/products/product.routes');
const categoryRoutes = require('./modules/categories/category.routes');
const cartRoutes = require('./modules/cart/cart.routes');
const orderRoutes = require('./modules/orders/order.routes');
const { reviewRouter } = require('./modules/review/review.routes');
const wishlistRoutes = require('./modules/wishlist/wishlist.routes');
const couponRoutes = require('./modules/coupons/coupon.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const floristRoutes = require('./modules/florist/florist.routes');
const supportRoutes = require('./modules/support/support.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const { paymentRouter, webhookRouter } = require('./modules/payment/payment.routes');
const chatRoutes = require('./modules/chat/chat.routes');
const chatbotRoutes = require('./modules/chatbot/chatbot.routes');

const app = express();
const API = '/api/v1';

app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

app.use(helmet());

const allowedOrigins = config.clientOrigins || [];
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      // AppError (not a bare Error) so a disallowed origin is a clean 403, not a logged 500.
      return cb(new AppError('Not allowed by CORS', 403));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  })
);

if (config.nodeEnv !== 'test') {
  app.use(morgan(config.isProd ? 'combined' : 'dev'));
}

app.use(`${API}/payments/webhook`, webhookRouter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(sanitize);

app.use('/api', globalLimiter);

app.get('/health', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({
    success: dbUp,
    message: dbUp ? 'OK' : 'Database unavailable',
    data: {
      status: dbUp ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
    },
  });
});

app.use(`${API}/auth`, authRoutes);
app.use(`${API}/products`, productRoutes);
app.use(`${API}/categories`, categoryRoutes);
app.use(`${API}/cart`, cartRoutes);
app.use(`${API}/orders`, orderRoutes);
app.use(`${API}/reviews`, reviewRouter);
app.use(`${API}/wishlist`, wishlistRoutes);
app.use(`${API}/coupons`, couponRoutes);
app.use(`${API}/inventory`, inventoryRoutes);
app.use(`${API}/florist`, floristRoutes);
app.use(`${API}/support`, supportRoutes);
app.use(`${API}/admin`, adminRoutes);
app.use(`${API}/payments`, paymentRouter);
app.use(`${API}/chat`, chatRoutes);
app.use(`${API}/chatbot`, chatbotRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;