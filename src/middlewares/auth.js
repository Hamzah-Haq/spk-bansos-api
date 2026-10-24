import { HttpError } from '../utils/http-error.js';
import { findActiveUser } from '../modules/auth/auth.service.js';
import { destroySession } from '../lib/session.js';

// 401 when not logged in. Sets req.user = { id, username, nama, role, rt }.
export async function requireAuth(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) {
    throw new HttpError(401, 'Silakan login terlebih dahulu');
  }

  const user = await findActiveUser(userId);
  if (!user) {
    // Account was deleted or deactivated after login
    await destroySession(req);
    throw new HttpError(401, 'Sesi tidak berlaku, silakan login kembali');
  }

  req.user = user;
  next();
}

// 403 when the logged-in user's role is not allowed. Use after requireAuth:
//   router.use(requireAuth, requireRole('desa'))
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      throw new HttpError(403, 'Anda tidak memiliki akses ke fitur ini');
    }
    next();
  };
}
