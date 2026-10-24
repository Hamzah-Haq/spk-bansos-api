import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../utils/http-error.js';

// Compared against when the username doesn't exist, so response time doesn't reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

const userInclude = { rt: { select: { id: true, noRt: true, noRw: true } } };

// Shape sent to clients; never includes passwordHash.
export function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    nama: user.nama,
    role: user.role,
    rt: user.rt ?? null,
  };
}

export async function login({ username, password }) {
  const user = await prisma.user.findUnique({ where: { username }, include: userInclude });
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordOk) {
    throw new HttpError(401, 'Username atau password salah');
  }
  if (!user.isActive) {
    throw new HttpError(403, 'Akun dinonaktifkan, hubungi admin desa');
  }

  return toPublicUser(user);
}

// Re-read on every authenticated request so role changes and deactivation apply immediately.
export async function findActiveUser(id) {
  const user = await prisma.user.findUnique({ where: { id }, include: userInclude });
  return user?.isActive ? toPublicUser(user) : null;
}
