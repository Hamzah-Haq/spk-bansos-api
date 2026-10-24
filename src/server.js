import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { sessionStore } from './lib/session.js';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`spk-bansos-api listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close();
  await Promise.all([prisma.$disconnect(), sessionStore.close()]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
