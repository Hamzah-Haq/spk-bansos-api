import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { healthRouter } from './modules/health/health.routes.js';
import { notFound, errorHandler } from './middlewares/error-handler.js';

export function createApp() {
  const app = express();

  // Behind nginx (Docker) / Vite proxy (dev): trust X-Forwarded-* for secure cookies & client IP
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  app.use(express.json());

  // Every route lives under /api so nginx and the Vite proxy can forward a single prefix.
  app.use('/api/health', healthRouter);

  app.use('/api', notFound);
  app.use(errorHandler);

  return app;
}
