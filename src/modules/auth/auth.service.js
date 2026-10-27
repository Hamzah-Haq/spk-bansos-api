import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../lib/audit.js';
import { revokeUserSessions } from '../../lib/session.js';
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

// Keeps the current session (`currentSid`) and logs the account out everywhere else.
export async function changePassword(user, { currentPassword, newPassword }, currentSid) {
  const { passwordHash } = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  if (!(await bcrypt.compare(currentPassword, passwordHash))) {
    throw new HttpError(400, 'Password lama salah', { currentPassword: 'Password lama salah' });
  }
  if (currentPassword === newPassword) {
    throw new HttpError(400, 'Password baru harus berbeda', {
      newPassword: 'Password baru harus berbeda dari password lama',
    });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    }),
    audit(prisma, {
      userId: user.id,
      aksi: 'user.change_password',
      entitas: 'user',
      entitasId: user.id,
    }),
  ]);
  await revokeUserSessions(user.id, currentSid);
}

// Re-read on every authenticated request so role changes and deactivation apply immediately.
export async function findActiveUser(id) {
  const user = await prisma.user.findUnique({ where: { id }, include: userInclude });
  return user?.isActive ? toPublicUser(user) : null;
}
