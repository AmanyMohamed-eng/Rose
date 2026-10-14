const mongoose = require('mongoose');
const { config } = require('./env');

mongoose.set('strictQuery', true);

const connectDB = async () => {
  await mongoose.connect(config.mongoUrl, { serverSelectionTimeoutMS: 10000 });
  console.log('MongoDB connected successfully');
};

module.exports = connectDB;
