// Prisma 7 does not load .env by itself; dotenv is a no-op inside Docker,
// where DATABASE_URL comes from docker-compose.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.js',
  },
  // process.env (not prisma's env() helper) so `prisma generate` works during
  // `docker build`, where DATABASE_URL is not set yet.
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
