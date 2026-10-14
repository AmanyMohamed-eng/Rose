/**
 * Decides whether the database-backed suites can run.
 *  1. TEST_MONGO_URI / MONGODB_TEST_URL (must point at a database whose name contains "test"), else
 *  2. an ephemeral mongodb-memory-server (needs to download a mongod binary on first use).
 * If neither works the integration suites are skipped (not failed) and the reason is printed.
 */
module.exports = async () => {
  const explicit = process.env.TEST_MONGO_URI || process.env.MONGODB_TEST_URL;
  if (explicit) {
    const dbName = explicit.split('?')[0].split('/').pop();
    if (!/test/i.test(dbName)) {
      throw new Error('Refusing to run destructive tests: the test database name must contain "test".');
    }
    process.env.TEST_MONGO_URI = explicit;
    return;
  }
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const server = await MongoMemoryServer.create({ instance: { dbName: 'rose_test' } });
    process.env.TEST_MONGO_URI = server.getUri('rose_test');
    global.__MONGOD__ = server;
  } catch (err) {
    console.warn(`\n[tests] Database-backed suites SKIPPED: no MongoDB available (${String(err.message).split('\n')[0]}).`);
    console.warn('[tests] Set TEST_MONGO_URI=mongodb://127.0.0.1:27017/rose_test to run them.\n');
  }
  // jest runs globalTeardown in a separate context, so stop the server on process exit instead.
  process.on('exit', () => { try { global.__MONGOD__ && global.__MONGOD__.stop(); } catch (e) { /* ignore */ } });
};
