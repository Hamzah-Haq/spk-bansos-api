import { prisma } from '../../lib/prisma.js';
import { audit, diff } from '../../lib/audit.js';
import { HttpError } from '../../utils/http-error.js';

// Fewest answer options a question can have (a survey can't be started until every question has them)
export const MIN_OPSI = 2;

export const pertanyaanSelect = {
  id: true,
  kriteriaId: true,
  kode: true,
  teks: true,
  urutan: true,
  opsi: {
    select: { id: true, label: true, skor: true, urutan: true },
    orderBy: [{ urutan: 'asc' }, { id: 'asc' }],
  },
  _count: { select: { jawaban: true } },
};

export function toPublicPertanyaan({ _count, ...pertanyaan }) {
  return {
    ...pertanyaan,
    jumlahJawaban: _count.jawaban,
  };
}

// The questionnaire's structure and scores are frozen while any periode that isn't final has
// surveys: otherwise two KK choosing the same answer in one periode could get different scores
// (jawaban.skor is copied at answer time). Returns the reason, or null when editing is allowed.
export async function kuesionerLockReason() {
  const count = await prisma.survei.count({
    where: { periode: { status: { in: ['open', 'closed'] } } },
  });
  if (!count) return null;
  return (
    `Kuesioner terkunci karena sudah ada ${count} survei pada periode yang belum final. ` +
    'Hanya teks pertanyaan dan label opsi yang dapat diubah.'
  );
}

async function assertUnlocked() {
  const reason = await kuesionerLockReason();
  if (reason) throw new HttpError(409, reason);
}

async function getPertanyaan(id) {
  const pertanyaan = await prisma.pertanyaan.findUnique({ where: { id }, select: pertanyaanSelect });
  if (!pertanyaan) throw new HttpError(404, 'Pertanyaan tidak ditemukan');
  return toPublicPertanyaan(pertanyaan);
}

async function assertKodeFree(kode, exceptId) {
  const existing = await prisma.pertanyaan.findUnique({ where: { kode }, select: { id: true } });
  if (existing && existing.id !== exceptId) {
    throw new HttpError(409, `Kode pertanyaan ${kode} sudah digunakan`, {
      kode: 'Kode pertanyaan sudah digunakan',
    });
  }
}

// A new question has no options yet; the survey form needs them before it can be filled.
export async function createPertanyaan(actor, { kriteriaId, kode, teks }) {
  await assertUnlocked();
  const kriteria = await prisma.kriteria.findUnique({ where: { id: kriteriaId }, select: { id: true } });
  if (!kriteria) {
    throw new HttpError(400, 'Data yang dikirim tidak valid', { kriteriaId: 'Kriteria tidak ditemukan' });
  }
  await assertKodeFree(kode);

  const last = await prisma.pertanyaan.findFirst({
    where: { kriteriaId },
    orderBy: { urutan: 'desc' },
    select: { urutan: true },
  });

  return prisma.$transaction(async (tx) => {
    const created = await tx.pertanyaan.create({
      data: {
        kriteriaId,
        kode,
        teks,
        urutan: (last?.urutan ?? 0) + 1,
      },
      select: pertanyaanSelect,
    });
    await audit(tx, {
      userId: actor.id,
      aksi: 'pertanyaan.create',
      entitas: 'pertanyaan',
      entitasId: created.id,
      data: { kriteriaId, kode, teks },
    });
    return toPublicPertanyaan(created);
  });
}

// Text and code only; moving a question to another kriteria would change the SAW conversion.
export async function updatePertanyaan(actor, id, input) {
  const before = await getPertanyaan(id);
  if (input.kode) await assertKodeFree(input.kode, id);

  const changes = diff(before, input);
  if (!Object.keys(changes).length) return before;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.pertanyaan.update({ where: { id }, data: input, select: pertanyaanSelect });
    await audit(tx, {
      userId: actor.id,
      aksi: 'pertanyaan.update',
      entitas: 'pertanyaan',
      entitasId: id,
      data: changes,
    });
    return toPublicPertanyaan(updated);
  });
}

export async function deletePertanyaan(actor, id) {
  const pertanyaan = await getPertanyaan(id);
  await assertUnlocked();

  if (pertanyaan.jumlahJawaban) {
    throw new HttpError(
      409,
      `Pertanyaan ${pertanyaan.kode} sudah dijawab pada ${pertanyaan.jumlahJawaban} survei sehingga tidak dapat dihapus`,
    );
  }
  // Each criterion's value is the average of its questions, so it needs at least one
  const siblings = await prisma.pertanyaan.count({ where: { kriteriaId: pertanyaan.kriteriaId } });
  if (siblings <= 1) {
    throw new HttpError(409, 'Setiap kriteria minimal memiliki satu pertanyaan');
  }

  await prisma.$transaction([
    prisma.pertanyaan.delete({ where: { id } }),
    audit(prisma, {
      userId: actor.id,
      aksi: 'pertanyaan.delete',
      entitas: 'pertanyaan',
      entitasId: id,
      data: { kode: pertanyaan.kode, teks: pertanyaan.teks, opsi: pertanyaan.opsi },
    }),
  ]);
}

// Replaces a question's options with `items` in that order: items with an id update that option,
// items without one are created, options left out are deleted (unless already used in answers).
export async function replaceOpsi(actor, pertanyaanId, items) {
  const pertanyaan = await prisma.pertanyaan.findUnique({
    where: { id: pertanyaanId },
    select: {
      kode: true,
      opsi: {
        select: {
          id: true,
          label: true,
          skor: true,
          _count: { select: { jawaban: true } },
        },
      },
    },
  });
  if (!pertanyaan) throw new HttpError(404, 'Pertanyaan tidak ditemukan');

  const existing = new Map(pertanyaan.opsi.map((o) => [o.id, o]));
  const unknown = items.findIndex((item) => item.id && !existing.has(item.id));
  if (unknown !== -1) {
    throw new HttpError(400, 'Data yang dikirim tidak valid', {
      [`opsi.${unknown}.label`]: 'Opsi ini bukan milik pertanyaan tersebut',
    });
  }

  const keptIds = new Set(items.map((item) => item.id).filter(Boolean));
  const removed = pertanyaan.opsi.filter((o) => !keptIds.has(o.id));
  const usedRemoved = removed.find((o) => o._count.jawaban > 0);
  if (usedRemoved) {
    throw new HttpError(
      409,
      `Opsi "${usedRemoved.label}" sudah dipilih pada ${usedRemoved._count.jawaban} jawaban survei sehingga ` +
        'tidak dapat dihapus',
    );
  }

  // While locked only labels may change: no added/removed options and no new scores
  const changesScores =
    removed.length > 0 || items.some((item) => !item.id || existing.get(item.id).skor !== item.skor);
  if (changesScores) await assertUnlocked();

  await prisma.$transaction([
    prisma.opsiJawaban.deleteMany({ where: { id: { in: removed.map((o) => o.id) } } }),
    ...items.map((item, index) => {
      const data = { label: item.label, skor: item.skor, urutan: index + 1 };
      return item.id
        ? prisma.opsiJawaban.update({ where: { id: item.id }, data })
        : prisma.opsiJawaban.create({ data: { ...data, pertanyaanId } });
    }),
    audit(prisma, {
      userId: actor.id,
      aksi: 'pertanyaan.opsi',
      entitas: 'pertanyaan',
      entitasId: pertanyaanId,
      data: {
        kode: pertanyaan.kode,
        dari: pertanyaan.opsi.map(({ label, skor }) => ({ label, skor })),
        ke: items.map(({ label, skor }) => ({ label, skor })),
      },
    }),
  ]);
  return getPertanyaan(pertanyaanId);
}
