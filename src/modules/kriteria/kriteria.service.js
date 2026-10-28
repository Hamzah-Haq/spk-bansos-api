import { prisma } from '../../lib/prisma.js';
import { audit, diff } from '../../lib/audit.js';
import { HttpError } from '../../utils/http-error.js';
import { kuesionerLockReason, pertanyaanSelect, toPublicPertanyaan } from '../pertanyaan/pertanyaan.service.js';

const kriteriaSelect = {
  id: true,
  kode: true,
  nama: true,
  sifat: true,
  bobot: true,
  pertanyaan: {
    select: pertanyaanSelect,
    orderBy: [{ urutan: 'asc' }, { id: 'asc' }],
  },
};

// bobot is a Prisma Decimal, which JSON-serializes as a string; the API sends numbers.
function toPublicKriteria({ bobot, pertanyaan, ...kriteria }) {
  return {
    ...kriteria,
    bobot: Number(bobot),
    pertanyaan: pertanyaan.map(toPublicPertanyaan),
  };
}

// Sum in thousandths so 0.1 + 0.2 style float error can't fail the Σ = 1 check
function toThousandths(value) {
  return Math.round(Number(value) * 1000);
}

export async function listKriteria() {
  const [rows, lockReason] = await Promise.all([
    prisma.kriteria.findMany({ select: kriteriaSelect, orderBy: { kode: 'asc' } }),
    kuesionerLockReason(),
  ]);
  const data = rows.map(toPublicKriteria);

  return {
    data,
    meta: {
      totalBobot: data.reduce((sum, k) => sum + toThousandths(k.bobot), 0) / 1000,
      kuesionerTerkunci: lockReason,
    },
  };
}

async function getKriteria(id) {
  const kriteria = await prisma.kriteria.findUnique({ where: { id }, select: kriteriaSelect });
  if (!kriteria) throw new HttpError(404, 'Kriteria tidak ditemukan');
  return toPublicKriteria(kriteria);
}

// nama and sifat only. Changing sifat (benefit/cost) is allowed any time: every SAW run stores the
// sifat it used in perhitungan.bobot_snapshot, so earlier results stay explainable.
export async function updateKriteria(actor, id, input) {
  const before = await getKriteria(id);
  const changes = diff(before, input);
  if (!Object.keys(changes).length) return before;

  return prisma.$transaction(async (tx) => {
    await tx.kriteria.update({ where: { id }, data: input });
    await audit(tx, {
      userId: actor.id,
      aksi: 'kriteria.update',
      entitas: 'kriteria',
      entitasId: id,
      data: { kode: before.kode, ...changes },
    });
    return toPublicKriteria(await tx.kriteria.findUnique({ where: { id }, select: kriteriaSelect }));
  });
}

// Weights are saved together because only the full set can satisfy Σ bobot = 1.000.
export async function updateBobot(actor, items) {
  const all = await prisma.kriteria.findMany({ select: { id: true, kode: true, bobot: true } });
  const byId = new Map(all.map((k) => [k.id, k]));

  if (items.some((item) => !byId.has(item.id))) {
    throw new HttpError(400, 'Data yang dikirim tidak valid', { bobot: 'Terdapat kriteria yang tidak ditemukan' });
  }
  if (items.length !== all.length) {
    throw new HttpError(400, 'Data yang dikirim tidak valid', { bobot: 'Bobot semua kriteria wajib diisi' });
  }

  const total = items.reduce((sum, item) => sum + toThousandths(item.bobot), 0);
  if (total !== 1000) {
    const message = `Total bobot harus 1,000 (saat ini ${(total / 1000).toFixed(3).replace('.', ',')})`;
    throw new HttpError(400, message, { bobot: message });
  }

  const changes = {};
  for (const item of items) {
    const before = byId.get(item.id);
    if (toThousandths(before.bobot) !== toThousandths(item.bobot)) {
      changes[before.kode] = { dari: Number(before.bobot), ke: item.bobot };
    }
  }

  if (Object.keys(changes).length) {
    await prisma.$transaction([
      ...items.map((item) => prisma.kriteria.update({ where: { id: item.id }, data: { bobot: item.bobot } })),
      audit(prisma, {
        userId: actor.id,
        aksi: 'kriteria.bobot',
        entitas: 'kriteria',
        data: changes,
      }),
    ]);
  }
  return listKriteria();
}
