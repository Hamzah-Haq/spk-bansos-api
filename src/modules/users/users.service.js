import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { audit, diff } from '../../lib/audit.js';
import { revokeUserSessions } from '../../lib/session.js';
import { HttpError } from '../../utils/http-error.js';
import { paginate, pageMeta } from '../../utils/schemas.js';

// Same cost as the seed and login check
const BCRYPT_ROUNDS = 10;

// Never select passwordHash here; this shape goes straight to the client.
const userSelect = {
  id: true,
  username: true,
  nama: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  rt: { select: { id: true, noRt: true, noRw: true } },
};

export async function listUsers({ q, role, rtId, status, page, limit }) {
  const where = {
    ...(q && {
      OR: [
        { username: { contains: q, mode: 'insensitive' } },
        { nama: { contains: q, mode: 'insensitive' } },
      ],
    }),
    ...(role && { role }),
    ...(rtId && { rtId }),
    ...(status && { isActive: status === 'aktif' }),
  };

  const [data, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: [{ role: 'asc' }, { username: 'asc' }],
      ...paginate({ page, limit }),
    }),
    prisma.user.count({ where }),
  ]);
  return { data, meta: pageMeta({ page, limit }, total) };
}

export async function getUser(id) {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!user) throw new HttpError(404, 'Akun tidak ditemukan');
  return user;
}

async function assertUsernameFree(username, exceptId) {
  const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (existing && existing.id !== exceptId) {
    throw new HttpError(409, 'Username sudah digunakan', { username: 'Username sudah digunakan' });
  }
}

// RT accounts must belong to an existing RT (it scopes which KK they see); desa accounts have none.
async function resolveRtId(role, rtId) {
  if (role === 'desa') return null;

  if (!rtId) {
    throw new HttpError(400, 'Data yang dikirim tidak valid', {
      rtId: 'Wilayah RT wajib dipilih untuk akun Ketua RT/RW',
    });
  }
  const rt = await prisma.rt.findUnique({ where: { id: rtId }, select: { id: true } });
  if (!rt) {
    throw new HttpError(400, 'Data yang dikirim tidak valid', { rtId: 'Wilayah RT tidak ditemukan' });
  }
  return rtId;
}

export async function createUser(actor, { password, rtId, ...input }) {
  await assertUsernameFree(input.username);
  const data = {
    ...input,
    rtId: await resolveRtId(input.role, rtId),
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
  };

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data, select: userSelect });
    await audit(tx, {
      userId: actor.id,
      aksi: 'user.create',
      entitas: 'user',
      entitasId: user.id,
      data: { username: user.username, role: user.role, rtId: data.rtId },
    });
    return user;
  });
}

export async function updateUser(actor, id, input) {
  const before = await getUser(id);

  // Guards against locking yourself out. Since the actor is an active desa account, this also
  // guarantees at least one active desa account always remains.
  if (id === actor.id && (input.role === 'rt' || input.isActive === false)) {
    throw new HttpError(409, 'Tidak dapat mengubah jabatan atau menonaktifkan akun sendiri');
  }
  if (input.username) await assertUsernameFree(input.username, id);

  const data = { ...input };
  if (input.role !== undefined || input.rtId !== undefined) {
    const role = input.role ?? before.role;
    data.rtId = await resolveRtId(role, input.rtId !== undefined ? input.rtId : before.rt?.id);
  }

  const changes = diff({ ...before, rtId: before.rt?.id ?? null }, data);
  if (!Object.keys(changes).length) return before;

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id }, data, select: userSelect });
    await audit(tx, {
      userId: actor.id,
      aksi: 'user.update',
      entitas: 'user',
      entitasId: id,
      data: changes,
    });
    return updated;
  });

  // requireAuth would reject them on the next request anyway; this also clears the stored sessions
  if (changes.isActive?.ke === false) await revokeUserSessions(id);
  return user;
}

export async function resetPassword(actor, id, password) {
  if (id === actor.id) {
    throw new HttpError(409, 'Gunakan menu Pengaturan untuk mengganti password akun sendiri');
  }
  await getUser(id);
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash } }),
    audit(prisma, {
      userId: actor.id,
      aksi: 'user.reset_password',
      entitas: 'user',
      entitasId: id,
    }),
  ]);
  await revokeUserSessions(id);
}

export async function deleteUser(actor, id) {
  if (id === actor.id) throw new HttpError(409, 'Tidak dapat menghapus akun sendiri');

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      username: true,
      role: true,
      _count: { select: { surveiDibuat: true, surveiDiverifikasi: true, perhitungan: true } },
    },
  });
  if (!user) throw new HttpError(404, 'Akun tidak ditemukan');

  // Survei and SAW snapshots must keep pointing at who made them
  const { surveiDibuat, surveiDiverifikasi, perhitungan } = user._count;
  if (surveiDibuat || surveiDiverifikasi || perhitungan) {
    throw new HttpError(
      409,
      'Akun sudah memiliki riwayat survei atau perhitungan sehingga tidak dapat dihapus. ' +
        'Nonaktifkan akun sebagai gantinya.',
    );
  }

  await prisma.$transaction([
    prisma.user.delete({ where: { id } }),
    audit(prisma, {
      userId: actor.id,
      aksi: 'user.delete',
      entitas: 'user',
      entitasId: id,
      data: { username: user.username, role: user.role },
    }),
  ]);
  await revokeUserSessions(id);
}
