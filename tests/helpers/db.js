const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const enabled = !!process.env.TEST_MONGO_URI;
// Use describeDb(...) for suites that need a real MongoDB; they are skipped (not failed) when none is available.
const describeDb = enabled ? describe : describe.skip;

const connect = async () => {
  const uri = process.env.TEST_MONGO_URI;
  const dbName = uri.split('?')[0].split('/').pop();
  if (!/test/i.test(dbName)) throw new Error('Refusing to touch a database whose name does not contain "test"');
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  // Make sure unique / partial indexes exist before concurrency tests rely on them.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
};

const disconnect = async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
};

const tokenFor = (user) =>
  jwt.sign({ id: String(user._id), role: user.role, tv: user.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });

const bearer = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });

module.exports = { describeDb, connect, disconnect, tokenFor, bearer };
