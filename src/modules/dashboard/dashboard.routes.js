import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import * as controller from './dashboard.controller.js';

export const dashboardRouter = Router();

// Role-aware summary for the home page: an RT account only gets numbers for its own RT.
dashboardRouter.use(requireAuth);

// GET /api/dashboard → { data: { periode, kk, survei, ... } } (desa also gets perRt and kuesioner)
dashboardRouter.get('/', controller.get);
