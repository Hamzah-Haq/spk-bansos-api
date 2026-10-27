import { prisma } from '../../lib/prisma.js';
import { audit, diff } from '../../lib/audit.js';
import { HttpError } from '../../utils/http-error.js';

// open:   RT can create/submit surveys, Desa verifies.
// closed: no new surveys; Desa finishes verification and runs SAW. Can be reopened.
// final:  results are locked; nothing about the periode can change any more.
const TRANSITIONS = {
  open: ['closed'],
  closed: ['open', 'final'],
  final: [],
};

const STATUS_LABELS = {
  open: 'Dibuka',
  closed: 'Ditutup',
  final: 'Final',
};

const periodeSelect = {
  id: true,
  nama: true,
  tahun: true,
  kuota: true,
  status: true,
  createdAt: true,
  _count: { select: { survei: true, perhitungan: true } },
};

function toPublicPeriode({ _count, ...periode }) {
  return {
    ...periode,
    jumlahSurvei: _count.survei,
    jumlahPerhitungan: _count.perhitungan,
  };
}

export async function listPeriode({ status }) {
  const rows = await prisma.periode.findMany({
    where: status ? { status } : undefined,
    select: periodeSelect,
    orderBy: [{ tahun: 'desc' }, { id: 'desc' }],
  });
  return rows.map(toPublicPeriode);
}

export async function getPeriode(id) {
  const periode = await prisma.periode.findUnique({ where: { id }, select: periodeSelect });
  if (!periode) throw new HttpError(404, 'Periode tidak ditemukan');
  return toPublicPeriode(periode);
}

// One open periode at a time, so RT always knows which periode a new survey belongs to.
async function assertNoOtherOpen(exceptId) {
  const open = await prisma.periode.findFirst({
    where: { status: 'open', ...(exceptId && { id: { not: exceptId } }) },
    select: { nama: true },
  });
  if (open) {
    throw new HttpError(409, `Periode "${open.nama}" masih dibuka. Tutup periode tersebut terlebih dahulu.`);
  }
}

function assertNotFinal(periode) {
  if (periode.status === 'final') {
    throw new HttpError(409, `Periode "${periode.nama}" sudah final dan tidak dapat diubah`);
  }
}

export async function createPeriode(actor, input) {
  await assertNoOtherOpen();

  const periode = await prisma.$transaction(async (tx) => {
    const created = await tx.periode.create({ data: input });
    await audit(tx, {
      userId: actor.id,
      aksi: 'periode.create',
      entitas: 'periode',
      entitasId: created.id,
      data: input,
    });
    return created;
  });
  return getPeriode(periode.id);
}

export async function updatePeriode(actor, id, input) {
  const before = await getPeriode(id);
  assertNotFinal(before);

  const changes = diff(before, input);
  if (Object.keys(changes).length) {
    await prisma.$transaction([
      prisma.periode.update({ where: { id }, data: input }),
      audit(prisma, {
        userId: actor.id,
        aksi: 'periode.update',
        entitas: 'periode',
        entitasId: id,
        data: changes,
      }),
    ]);
  }
  return getPeriode(id);
}

export async function changeStatus(actor, id, status) {
  const before = await getPeriode(id);
  if (before.status === status) return before;

  if (!TRANSITIONS[before.status].includes(status)) {
    throw new HttpError(
      409,
      `Status periode tidak dapat diubah dari ${STATUS_LABELS[before.status]} ke ${STATUS_LABELS[status]}`,
    );
  }
  if (status === 'open') await assertNoOtherOpen(id);
  // TODO(SAW): once the SAW engine exists, require at least one perhitungan before 'final'.

  await prisma.$transaction([
    prisma.periode.update({ where: { id }, data: { status } }),
    audit(prisma, {
      userId: actor.id,
      aksi: 'periode.status',
      entitas: 'periode',
      entitasId: id,
      data: { dari: before.status, ke: status },
    }),
  ]);
  return getPeriode(id);
}

export async function deletePeriode(actor, id) {
  const periode = await getPeriode(id);
  assertNotFinal(periode);
  if (periode.jumlahSurvei || periode.jumlahPerhitungan) {
    throw new HttpError(
      409,
      `Periode "${periode.nama}" sudah memiliki ${periode.jumlahSurvei} survei dan ` +
        `${periode.jumlahPerhitungan} perhitungan sehingga tidak dapat dihapus`,
    );
  }

  await prisma.$transaction([
    prisma.periode.delete({ where: { id } }),
    audit(prisma, {
      userId: actor.id,
      aksi: 'periode.delete',
      entitas: 'periode',
      entitasId: id,
      data: { nama: periode.nama, tahun: periode.tahun },
    }),
  ]);
}
