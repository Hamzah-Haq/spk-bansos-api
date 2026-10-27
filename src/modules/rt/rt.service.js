import { prisma } from '../../lib/prisma.js';
import { audit, diff } from '../../lib/audit.js';
import { HttpError } from '../../utils/http-error.js';

const rtSelect = {
  id: true,
  noRt: true,
  noRw: true,
  _count: { select: { users: true, kartuKeluarga: true } },
};

function toPublicRt({ _count, ...rt }) {
  return {
    ...rt,
    jumlahAkun: _count.users,
    jumlahKk: _count.kartuKeluarga,
  };
}

export async function listRt() {
  const rows = await prisma.rt.findMany({
    select: rtSelect,
    orderBy: [{ noRw: 'asc' }, { noRt: 'asc' }],
  });
  return rows.map(toPublicRt);
}

export async function getRt(id) {
  const rt = await prisma.rt.findUnique({ where: { id }, select: rtSelect });
  if (!rt) throw new HttpError(404, 'Wilayah RT tidak ditemukan');
  return toPublicRt(rt);
}

async function assertUnique({ noRt, noRw }, exceptId) {
  const existing = await prisma.rt.findUnique({ where: { noRt_noRw: { noRt, noRw } } });
  if (existing && existing.id !== exceptId) {
    throw new HttpError(409, `RT ${noRt}/RW ${noRw} sudah terdaftar`, {
      noRt: 'Kombinasi No. RT dan No. RW sudah terdaftar',
    });
  }
}

export async function createRt(actor, input) {
  await assertUnique(input);

  const rt = await prisma.$transaction(async (tx) => {
    const created = await tx.rt.create({ data: input });
    await audit(tx, {
      userId: actor.id,
      aksi: 'rt.create',
      entitas: 'rt',
      entitasId: created.id,
      data: input,
    });
    return created;
  });
  return getRt(rt.id);
}

export async function updateRt(actor, id, input) {
  const before = await getRt(id);
  const next = { noRt: input.noRt ?? before.noRt, noRw: input.noRw ?? before.noRw };
  await assertUnique(next, id);

  const changes = diff(before, input);
  if (Object.keys(changes).length) {
    await prisma.$transaction([
      prisma.rt.update({ where: { id }, data: next }),
      audit(prisma, {
        userId: actor.id,
        aksi: 'rt.update',
        entitas: 'rt',
        entitasId: id,
        data: changes,
      }),
    ]);
  }
  return getRt(id);
}

export async function deleteRt(actor, id) {
  const rt = await getRt(id);
  // users.rt_id is ON DELETE SET NULL: deleting would leave RT accounts without a wilayah
  if (rt.jumlahAkun || rt.jumlahKk) {
    throw new HttpError(
      409,
      `RT ${rt.noRt}/RW ${rt.noRw} masih memiliki ${rt.jumlahAkun} akun dan ${rt.jumlahKk} KK. ` +
        'Pindahkan atau hapus data tersebut terlebih dahulu.',
    );
  }

  await prisma.$transaction([
    prisma.rt.delete({ where: { id } }),
    audit(prisma, {
      userId: actor.id,
      aksi: 'rt.delete',
      entitas: 'rt',
      entitasId: id,
      data: { noRt: rt.noRt, noRw: rt.noRw },
    }),
  ]);
}
