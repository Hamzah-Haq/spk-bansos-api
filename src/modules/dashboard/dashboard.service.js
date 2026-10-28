import { prisma } from '../../lib/prisma.js';
import { scopedRtId } from '../kk/kk.service.js';
import { kelengkapanKuesioner } from '../pertanyaan/pertanyaan.service.js';

const periodeSelect = {
  id: true,
  nama: true,
  tahun: true,
  kuota: true,
  status: true,
};

function emptyCounts() {
  return {
    draft: 0,
    submitted: 0,
    verified: 0,
    rejected: 0,
  };
}

// The periode the dashboard is about: the open one, else the newest.
async function currentPeriode() {
  const open = await prisma.periode.findFirst({ where: { status: 'open' }, select: periodeSelect });
  return (
    open ??
    prisma.periode.findFirst({
      select: periodeSelect,
      orderBy: [{ tahun: 'desc' }, { id: 'desc' }],
    })
  );
}

// Survey status counts of the current periode, overall and per RT; `belumDisurvei` = KK without a
// survey in that periode (a draft counts as started).
export async function getDashboard(actor) {
  const rtId = scopedRtId(actor);
  const periode = await currentPeriode();

  const [kkPerRt, survei] = await Promise.all([
    prisma.kartuKeluarga.groupBy({
      by: ['rtId'],
      where: { rtId },
      _count: { _all: true },
    }),
    periode
      ? prisma.survei.findMany({
          where: { periodeId: periode.id, kk: { rtId } },
          select: { status: true, kk: { select: { rtId: true } } },
        })
      : [],
  ]);

  const counts = emptyCounts();
  const countsByRt = new Map();
  for (const s of survei) {
    counts[s.status]++;
    if (!countsByRt.has(s.kk.rtId)) countsByRt.set(s.kk.rtId, emptyCounts());
    countsByRt.get(s.kk.rtId)[s.status]++;
  }
  const totalKk = kkPerRt.reduce((sum, row) => sum + row._count._all, 0);

  const summary = {
    periode,
    kk: {
      total: totalKk,
      belumDisurvei: totalKk - survei.length,
    },
    survei: { ...counts, total: survei.length },
  };
  if (actor.role !== 'desa') return summary;

  const [rtList, kuesioner, kriteria, akunRtAktif] = await Promise.all([
    prisma.rt.findMany({
      select: { id: true, noRt: true, noRw: true },
      orderBy: [{ noRw: 'asc' }, { noRt: 'asc' }],
    }),
    kelengkapanKuesioner(),
    prisma.kriteria.findMany({ select: { bobot: true } }),
    prisma.user.count({ where: { role: 'rt', isActive: true } }),
  ]);
  const kkByRt = new Map(kkPerRt.map((row) => [row.rtId, row._count._all]));

  return {
    ...summary,
    perRt: rtList.map((rt) => {
      const rtCounts = countsByRt.get(rt.id) ?? emptyCounts();
      const jumlahKk = kkByRt.get(rt.id) ?? 0;
      const disurvei = Object.values(rtCounts).reduce((sum, n) => sum + n, 0);
      return {
        rt,
        jumlahKk,
        survei: rtCounts,
        belumDisurvei: jumlahKk - disurvei,
      };
    }),
    kuesioner: {
      ...kuesioner,
      // Thousandths, as in kriteria.service, so float error can't make 1.000 look wrong
      totalBobot: kriteria.reduce((sum, k) => sum + Math.round(Number(k.bobot) * 1000), 0) / 1000,
    },
    akunRtAktif,
  };
}
