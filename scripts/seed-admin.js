/**
 * Creates the first (owner) admin. There is no public way to become an admin.
 *   ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD must be set (see .env.example)
 *   npm run seed:admin
 */
const mongoose = require('mongoose');
const { config } = require('../src/config/env');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const AdminProfile = require('../src/models/AdminProfile');

const run = async () => {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!config.mongoUrl) throw new Error('MONGODB_URL is required');
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD are required');
  }
  if (ADMIN_PASSWORD.length < 8 || !/[A-Za-z]/.test(ADMIN_PASSWORD) || !/\d/.test(ADMIN_PASSWORD)) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters and contain a letter and a number');
  }

  await connectDB();

  if (await User.exists({ email: ADMIN_EMAIL.toLowerCase() })) {
    console.log('A user with this email already exists. Nothing to do.');
    return;
  }
  const user = await User.create({ name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' });
  await AdminProfile.create({ user: user._id, department: 'OWNER', isOwner: true });
  console.log(`Owner admin created: ${user.email}`);
};

run()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.connection.close());
