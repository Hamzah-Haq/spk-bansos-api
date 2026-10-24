import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as controller from './users.controller.js';

export const usersRouter = Router();

// Account management is a Perangkat Desa feature only.
usersRouter.use(requireAuth, requireRole('desa'));

// GET /api/users → all accounts (desa + RT), without password hashes
usersRouter.get('/', controller.list);
