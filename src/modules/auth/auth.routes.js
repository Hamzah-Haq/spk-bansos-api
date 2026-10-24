import { Router } from 'express';
import { HttpError } from '../../utils/http-error.js';
import { requireAuth } from '../../middlewares/auth.js';
import * as controller from './auth.controller.js';

export const authRouter = Router();

function validateLogin(req, res, next) {
  const { username, password } = req.body ?? {};
  const details = {};
  if (typeof username !== 'string' || !username.trim()) details.username = 'Username wajib diisi';
  if (typeof password !== 'string' || !password) details.password = 'Password wajib diisi';

  if (Object.keys(details).length) {
    throw new HttpError(400, 'Data login tidak valid', details);
  }
  req.body = { username: username.trim(), password };
  next();
}

// POST /api/auth/login   { username, password } → sets httpOnly cookie, returns { user }
authRouter.post('/login', validateLogin, controller.login);
// POST /api/auth/logout  → destroys the session, clears the cookie
authRouter.post('/logout', controller.logout);
// GET  /api/auth/me      → current user (frontend calls this on load to restore the session)
authRouter.get('/me', requireAuth, controller.me);
