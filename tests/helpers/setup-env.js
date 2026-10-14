// Test-only configuration. No real secrets: every value below is a dummy used against local test doubles only.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.BCRYPT_ROUNDS = '4';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_not_a_real_key';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
process.env.CLIENT_URL = 'http://localhost:4200';
if (process.env.TEST_MONGO_URI) process.env.MONGODB_URL = process.env.TEST_MONGO_URI;
