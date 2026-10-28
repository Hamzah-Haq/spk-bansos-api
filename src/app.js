import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { sessionMiddleware } from './lib/session.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { rtRouter } from './modules/rt/rt.routes.js';
import { periodeRouter } from './modules/periode/periode.routes.js';
import { kkRouter } from './modules/kk/kk.routes.js';
import { notFound, errorHandler } from './middlewares/error-handler.js';

export function createApp() {
  const app = express();

  // Behind nginx (Docker) / Vite proxy (dev): trust X-Forwarded-* for secure cookies & client IP
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  app.use(express.json());
  app.use(sessionMiddleware);

  // Every route lives under /api so nginx and the Vite proxy can forward a single prefix.
  // Auth/role guards are applied inside each router (see middlewares/auth.js).
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/rt', rtRouter);
  app.use('/api/periode', periodeRouter);
  app.use('/api/kk', kkRouter);

  app.use('/api', notFound);
  app.use(errorHandler);

  return app;
}
