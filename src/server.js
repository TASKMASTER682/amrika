const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const connectDB = require('./config/db');
const config = require('./config/env');

async function main() {
  await connectDB();

  const server = http.createServer(app);

  /**
   * Socket.io is wired up but deliberately minimal for now — a `notifications`
   * room per user is the extension point for real-time features called out
   * in the spec (live rank updates, test-series announcements, proctoring
   * events). Keeping it thin here avoids coupling the HTTP API to a specific
   * real-time feature before one is actually built.
   */
  const io = new Server(server, {
    cors: { origin: config.clientUrl, credentials: true },
  });

  io.on('connection', (socket) => {
    socket.on('join', (userId) => {
      if (userId) socket.join(`user:${userId}`);
    });
  });

  app.set('io', io); // controllers can reach this via req.app.get('io').to(`user:${id}`).emit(...)

  server.listen(config.port, () => {
    console.log(`[server] ExamOS API listening on port ${config.port} (${config.env})`);
  });

  const shutdown = (signal) => {
    console.log(`[server] ${signal} received, shutting down gracefully`);
    server.close(() => process.exit(0));
    // Force-exit if connections don't close in time.
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
