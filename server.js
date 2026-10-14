const { config, validateEnv } = require('./src/config/env');

try {
  validateEnv();
} catch (err) {
  console.error('Environment validation failed:', err.message);
  process.exit(1);
}

const http = require('http');
const mongoose = require('mongoose');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { initChatSocket } = require('./src/modules/chat/chat.socket');

let server;              
let io;                  
let shuttingDown = false;

const start = async () => {
  try {
    await connectDB();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }

  server = http.createServer(app);

  io = initChatSocket(server, { corsOrigins: config.clientOrigins });

  server.listen(config.port, () => {
    console.log(`Rose API listening on port ${config.port} (${config.nodeEnv})`);
    console.log(`   WebSocket: ws://localhost:${config.port}/socket.io`);
  });
};

const shutdown = async (signal, exitCode = 0) => {
  if (shuttingDown) return;             
  shuttingDown = true;

  console.log(`${signal} received — shutting down gracefully...`);

  const forceExit = setTimeout(() => {
    console.error('⏱  Shutdown timed out after 10s — forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {

    if (io) {
      await new Promise((resolve) => io.close(resolve));
    } else if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    await mongoose.connection.close();

    console.log('Shutdown complete');
    clearTimeout(forceExit);
    process.exit(exitCode);
  } catch (err) {
    console.error('Error during shutdown:', err.message);
    clearTimeout(forceExit);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown('uncaughtException', 1);
});

start();