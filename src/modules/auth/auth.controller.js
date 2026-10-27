import * as authService from './auth.service.js';
import {
  SESSION_COOKIE,
  regenerateSession,
  saveSession,
  destroySession,
} from '../../lib/session.js';

export async function login(req, res) {
  const user = await authService.login(req.body);

  // New session id on login prevents session fixation.
  await regenerateSession(req);
  req.session.userId = user.id;
  await saveSession(req);

  res.json({ user });
}

export async function logout(req, res) {
  await destroySession(req);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ message: 'Logout berhasil' });
}

export function me(req, res) {
  res.json({ user: req.user });
}

export async function changePassword(req, res) {
  await authService.changePassword(req.user, req.valid.body, req.sessionID);
  res.json({ message: 'Password berhasil diubah' });
}
