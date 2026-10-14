require('dotenv').config();

// Values are read lazily so tests/scripts can set process.env before use.
const config = {
  get nodeEnv() { return process.env.NODE_ENV || 'development'; },
  get isProd() { return this.nodeEnv === 'production'; },
  get port() { return Number(process.env.PORT) || 5000; },
  get mongoUrl() { return process.env.MONGODB_URL; },
  get jwtSecret() { return process.env.JWT_SECRET; },
  get jwtExpiresIn() { return process.env.JWT_EXPIRE_IN || '1h'; },
  get bcryptRounds() { return Number(process.env.BCRYPT_ROUNDS) || 12; },
  get trustProxy() { return Number(process.env.TRUST_PROXY) || 0; },
  get clientOrigins() {
    const raw = process.env.CLIENT_URL;
    if (!raw) return this.isProd ? [] : ['http://localhost:4200'];
    return raw.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  },
};

/** Fail fast on missing/weak configuration. Called once from server.js. */
const validateEnv = () => {
  const problems = [];
  if (!config.mongoUrl) problems.push('MONGODB_URL is required');
  if (!config.jwtSecret) problems.push('JWT_SECRET is required');
  else if (config.jwtSecret.length < 32) problems.push('JWT_SECRET must be at least 32 characters');
  if (config.isProd && config.clientOrigins.length === 0) problems.push('CLIENT_URL is required in production');
  if (problems.length) {
    throw new Error(`Invalid environment configuration:\n - ${problems.join('\n - ')}`);
  }
};

module.exports = { config, validateEnv };
