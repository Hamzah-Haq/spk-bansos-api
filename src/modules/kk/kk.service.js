import { prisma } from '../../lib/prisma.js';
import { audit, diff } from '../../lib/audit.js';
import { HttpError } from '../../utils/http-error.js';
import { paginate, pageMeta } from '../../utils/schemas.js';

const kkSelect = {
  id: true,
  noKk: true,
  kepalaKeluarga: true,
  alamat: true,
  jumlahAnggota: true,
  createdAt: true,
  updatedAt: true,
  rt: { select: { id: true, noRt: true, noRw: true } },
  _count: { select: { survei: true, hasil: true } },
};

function toPublicKk({ _count, ...kk }) {
  return {
    ...kk,
    jumlahSurvei: _count.survei,
    jumlahHasil: _count.hasil,
  };
}

// The RT an account is limited to: its own RT for role rt, undefined (= whole village) for desa.
// Also used by survei.service: a survei is scoped through its KK.
export function scopedRtId(actor) {
  if (actor.role !== 'rt') return undefined;
  if (!actor.rt) {
    throw new HttpError(403, 'Akun Anda belum terhubung ke wilayah RT. Hubungi admin desa.');
  }
  return actor.rt.id;
}

export async function listKk(actor, { q, rtId, tanpaSurvei, page, limit }) {
  const where = {
    rtId: scopedRtId(actor) ?? rtId,
    // KK not yet surveyed in that periode (the "start a survey" picker)
    ...(tanpaSurvei && { survei: { none: { periodeId: tanpaSurvei } } }),
    ...(q && {
      OR: [
        { noKk: { contains: q } },
        { kepalaKeluarga: { contains: q, mode: 'insensitive' } },
        { alamat: { contains: q, mode: 'insensitive' } },
      ],
    }),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.kartuKeluarga.findMany({
      where,
      select: kkSelect,
      orderBy: [
        { rt: { noRw: 'asc' } },
        { rt: { noRt: 'asc' } },
        { kepalaKeluarga: 'asc' },
        { id: 'asc' },
      ],
      ...paginate({ page, limit }),
    }),
    prisma.kartuKeluarga.count({ where }),
  ]);
  return { data: rows.map(toPublicKk), meta: pageMeta({ page, limit }, total) };
}

// A KK outside the RT account's wilayah is reported as not found, not as forbidden.
export async function getKk(actor, id) {
  const kk = await prisma.kartuKeluarga.findFirst({
    where: { id, rtId: scopedRtId(actor) },
    select: kkSelect,
  });
  if (!kk) throw new HttpError(404, 'Data KK tidak ditemukan');
  return toPublicKk(kk);
}

async function assertNoKkFree(actor, noKk, exceptId) {
  const existing = await prisma.kartuKeluarga.findUnique({
    where: { noKk },
    select: { id: true, rt: { select: { id: true, noRt: true, noRw: true } } },
  });
  if (!existing || existing.id === exceptId) return;

  // An RT account must not learn who lives in another RT, only that the number is taken there
  const lokasi =
    actor.role === 'desa' || existing.rt.id === actor.rt?.id
      ? `di RT ${existing.rt.noRt}/RW ${existing.rt.noRw}`
      : 'di wilayah RT lain. Hubungi admin desa bila keluarga ini pindah domisili';
  const message = `No. KK sudah terdaftar ${lokasi}`;
  throw new HttpError(409, message, { noKk: message });
}

// Desa chooses the RT (required on create); RT accounts always use their own RT.
async function resolveRtId(actor, rtId, { required }) {
  const ownRtId = scopedRtId(actor);
  if (ownRtId) {
    if (rtId !== undefined && rtId !== ownRtId) {
      throw new HttpError(403, 'Ketua RT hanya dapat mengelola KK di wilayahnya sendiri');
    }
    return required ? ownRtId : undefined;
  }

  if (rtId === undefined) {
    if (!required) return undefined;
    throw new HttpError(400, 'Data yang dikirim tidak valid', { rtId: 'Wilayah RT wajib dipilih' });
  }
  const rt = await prisma.rt.findUnique({ where: { id: rtId }, select: { id: true } });
  if (!rt) {
    throw new HttpError(400, 'Data yang dikirim tidak valid', { rtId: 'Wilayah RT tidak ditemukan' });
  }
  return rtId;
}

export async function createKk(actor, { rtId, ...input }) {
  await assertNoKkFree(actor, input.noKk);
  const data = {
    ...input,
    rtId: await resolveRtId(actor, rtId, { required: true }),
  };

  return prisma.$transaction(async (tx) => {
    const kk = await tx.kartuKeluarga.create({ data, select: kkSelect });
    await audit(tx, {
      userId: actor.id,
      aksi: 'kk.create',
      entitas: 'kk',
      entitasId: kk.id,
      data: { noKk: kk.noKk, kepalaKeluarga: kk.kepalaKeluarga, rtId: data.rtId },
    });
    return toPublicKk(kk);
  });
}

export async function updateKk(actor, id, { rtId, ...input }) {
  const before = await getKk(actor, id);
  if (input.noKk) await assertNoKkFree(actor, input.noKk, id);

  const data = { ...input };
  const nextRtId = await resolveRtId(actor, rtId, { required: false });
  if (nextRtId !== undefined) data.rtId = nextRtId;

  const changes = diff({ ...before, rtId: before.rt.id }, data);
  if (!Object.keys(changes).length) return before;

  return prisma.$transaction(async (tx) => {
    const kk = await tx.kartuKeluarga.update({ where: { id }, data, select: kkSelect });
    await audit(tx, {
      userId: actor.id,
      aksi: 'kk.update',
      entitas: 'kk',
      entitasId: id,
      data: changes,
    });
    return toPublicKk(kk);
  });
}

export async function deleteKk(actor, id) {
  const kk = await getKk(actor, id);
  // Survei answers and SAW snapshots must keep pointing at the household they describe
  if (kk.jumlahSurvei || kk.jumlahHasil) {
    throw new HttpError(
      409,
      `KK ${kk.noKk} sudah memiliki riwayat survei atau hasil perhitungan sehingga tidak dapat dihapus.`,
    );
  }

  await prisma.$transaction([
    prisma.kartuKeluarga.delete({ where: { id } }),
    audit(prisma, {
      userId: actor.id,
      aksi: 'kk.delete',
      entitas: 'kk',
      entitasId: id,
      data: { noKk: kk.noKk, kepalaKeluarga: kk.kepalaKeluarga, rtId: kk.rt.id },
    }),
  ]);
}
