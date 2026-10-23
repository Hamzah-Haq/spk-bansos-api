import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';

export const healthRouter = Router();

// GET /api/health — used by the frontend status page and for smoke-testing Docker.
healthRouter.get('/', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down', time: new Date().toISOString() });
  }
});
