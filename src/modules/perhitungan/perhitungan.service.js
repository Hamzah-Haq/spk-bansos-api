import { prisma } from '../../lib/prisma.js';
import { audit } from '../../lib/audit.js';
import { PRESISI_V, SawError, hitungSaw, konversiNilai } from '../../lib/saw.js';
import { HttpError } from '../../utils/http-error.js';

// A run (perhitungan) is a snapshot: the bobot and sifat it used, min/max, and per KK the matrix row X,
// normalized row R, V, ranking and layak. Later changes to weights, sifat or kuota never rewrite it;
// they only make it "usang" (outdated), which is reported so the desa can run SAW again.

const runSelect = {
  id: true,
  executedAt: true,
  bobotSnapshot: true,
  minmaxSnapshot: true,
  periode: {
    select: {
      id: true,
      nama: true,
      tahun: true,
      kuota: true,
      status: true,
    },
  },
  executedBy: { select: { id: true, nama: true } },
};

const hasilSelect = {
  nilai: true,
  normalisasi: true,
  nilaiV: true,
  ranking: true,
  layak: true,
  kk: {
    select: {
      id: true,
      noKk: true,
      kepalaKeluarga: true,
      alamat: true,
      jumlahAnggota: true,
      rt: { select: { id: true, noRt: true, noRw: true } },
    },
  },
};

async function getPeriodeForRun(periodeId) {
  const periode = await prisma.periode.findUnique({
    where: { id: periodeId },
    select: {
      id: true,
      nama: true,
      kuota: true,
      status: true,
    },
  });
  if (!periode) throw new HttpError(404, 'Periode tidak ditemukan');
  if (periode.status === 'final') {
    throw new HttpError(409, `Periode "${periode.nama}" sudah final sehingga perhitungan tidak dapat dijalankan lagi`);
  }
  return periode;
}

// Why a stored run no longer matches the current data (empty = still current).
async function alasanUsang(run, jumlahHasil, jumlahLayak) {
  const [kriteria, jumlahTerverifikasi] = await Promise.all([
    prisma.kriteria.findMany({ select: { kode: true, sifat: true, bobot: true } }),
    prisma.survei.count({ where: { periodeId: run.periode.id, status: 'verified' } }),
  ]);

  const alasan = [];
  // A verification can't be undone, so the verified set only grows after the run
  if (jumlahTerverifikasi !== jumlahHasil) {
    alasan.push(`Ada ${jumlahTerverifikasi - jumlahHasil} survei baru terverifikasi setelah perhitungan ini`);
  }
  const berubah = kriteria
    .filter((k) => {
      const snap = run.bobotSnapshot[k.kode];
      return !snap || snap.sifat !== k.sifat || Math.round(snap.bobot * 1000) !== Math.round(Number(k.bobot) * 1000);
    })
    .map((k) => k.kode);
  if (berubah.length) alasan.push(`Bobot atau sifat ${berubah.join(', ')} sudah berubah`);
  if (Math.min(run.periode.kuota, jumlahHasil) !== jumlahLayak) {
    alasan.push(`Kuota periode sudah berubah menjadi ${run.periode.kuota} KK`);
  }
  return alasan;
}

async function latestRunId(periodeId) {
  const latest = await prisma.perhitungan.findFirst({
    where: { periodeId },
    select: { id: true },
    orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
  });
  return latest?.id ?? null;
}

export async function listPerhitungan({ periodeId }) {
  const rows = await prisma.perhitungan.findMany({
    where: periodeId ? { periodeId } : undefined,
    select: {
      id: true,
      executedAt: true,
      periode: { select: { id: true, nama: true, tahun: true } },
      executedBy: { select: { id: true, nama: true } },
      _count: { select: { hasil: true } },
    },
    orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
  });
  const layak = await prisma.hasilPerhitungan.groupBy({
    by: ['perhitunganId'],
    where: { perhitunganId: { in: rows.map((r) => r.id) }, layak: true },
    _count: { _all: true },
  });
  const layakById = new Map(layak.map((l) => [l.perhitunganId, l._count._all]));

  // Newest first, so the first row seen for a periode is its latest run
  const seen = new Set();
  return rows.map(({ _count, ...run }) => {
    const terbaru = !seen.has(run.periode.id);
    seen.add(run.periode.id);
    return {
      ...run,
      jumlahAlternatif: _count.hasil,
      jumlahLayak: layakById.get(run.id) ?? 0,
      terbaru,
    };
  });
}

export async function getPerhitungan(id) {
  const run = await prisma.perhitungan.findUnique({ where: { id }, select: runSelect });
  if (!run) throw new HttpError(404, 'Perhitungan tidak ditemukan');

  const rows = await prisma.hasilPerhitungan.findMany({
    where: { perhitunganId: id },
    select: hasilSelect,
    orderBy: { ranking: 'asc' },
  });
  const hasil = rows.map((row) => ({
    ...row,
    nilaiV: Number(row.nilaiV),
  }));

  // Same V (at the stored precision) as a neighbour = placed by the tie-break rule
  const jumlahPerV = new Map();
  for (const h of hasil) jumlahPerV.set(h.nilaiV, (jumlahPerV.get(h.nilaiV) ?? 0) + 1);
  for (const h of hasil) h.seri = jumlahPerV.get(h.nilaiV) > 1;

  const jumlahLayak = hasil.filter((h) => h.layak).length;
  const { bobotSnapshot, minmaxSnapshot, ...rest } = run;

  return {
    ...rest,
    kriteria: Object.entries(bobotSnapshot)
      .map(([kode, snap]) => ({ kode, ...snap, ...minmaxSnapshot[kode] }))
      .sort((a, b) => a.kode.localeCompare(b.kode)),
    jumlahAlternatif: hasil.length,
    jumlahLayak,
    terbaru: (await latestRunId(run.periode.id)) === id,
    usang: await alasanUsang(run, hasil.length, jumlahLayak),
    hasil,
  };
}

// Runs SAW on every verified survei of the periode and stores the snapshot. Allowed while the periode
// is open or closed (each run is kept); a final periode is read-only.
export async function runPerhitungan(actor, { periodeId }) {
  const periode = await getPeriodeForRun(periodeId);

  const [kriteriaRows, surveys] = await Promise.all([
    prisma.kriteria.findMany({
      select: {
        kode: true,
        nama: true,
        sifat: true,
        bobot: true,
        pertanyaan: {
          select: { id: true, kode: true },
          orderBy: [{ urutan: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: { kode: 'asc' },
    }),
    prisma.survei.findMany({
      where: { periodeId, status: 'verified' },
      select: {
        kk: {
          select: {
            id: true,
            noKk: true,
            jumlahAnggota: true,
          },
        },
        jawaban: { select: { pertanyaanId: true, skor: true } },
      },
    }),
  ]);
  if (!surveys.length) {
    throw new HttpError(409, `Belum ada survei terverifikasi pada periode "${periode.nama}"`);
  }

  const kriteria = kriteriaRows.map((k) => ({ ...k, bobot: Number(k.bobot) }));

  let run;
  try {
    const alternatif = surveys.map(({ kk, jawaban }) => {
      const skor = Object.fromEntries(jawaban.map((j) => [j.pertanyaanId, j.skor]));
      try {
        return {
          id: kk.id,
          noKk: kk.noKk,
          jumlahAnggota: kk.jumlahAnggota,
          label: `KK ${kk.noKk}`,
          nilai: konversiNilai(kriteria, skor),
        };
      } catch (err) {
        if (err instanceof SawError) throw new SawError(`Survei KK ${kk.noKk}: ${err.message}`);
        throw err;
      }
    });
    run = hitungSaw({ kriteria, alternatif, kuota: periode.kuota });
  } catch (err) {
    if (err instanceof SawError) throw new HttpError(409, err.message);
    throw err;
  }

  const bobotSnapshot = Object.fromEntries(
    kriteria.map((k) => [
      k.kode,
      {
        nama: k.nama,
        sifat: k.sifat,
        bobot: k.bobot,
      },
    ]),
  );

  const created = await prisma.$transaction(async (tx) => {
    const perhitungan = await tx.perhitungan.create({
      data: {
        periodeId,
        executedById: actor.id,
        bobotSnapshot,
        minmaxSnapshot: run.minmax,
        hasil: {
          create: run.hasil.map((h) => ({
            kkId: h.id,
            nilai: h.nilai,
            normalisasi: h.normalisasi,
            nilaiV: h.v.toFixed(PRESISI_V),
            ranking: h.ranking,
            layak: h.layak,
          })),
        },
      },
      select: { id: true },
    });
    await audit(tx, {
      userId: actor.id,
      aksi: 'perhitungan.create',
      entitas: 'perhitungan',
      entitasId: perhitungan.id,
      data: {
        periodeId,
        kuota: periode.kuota,
        jumlahAlternatif: run.hasil.length,
        bobot: bobotSnapshot,
      },
    });
    return perhitungan;
  });
  return getPerhitungan(created.id);
}

// For periode → final: the latest run must exist and still match the data.
export async function assertHasilSiapFinal(periodeId) {
  const id = await latestRunId(periodeId);
  if (!id) throw new HttpError(409, 'Jalankan perhitungan SAW terlebih dahulu sebelum periode difinalkan');

  const run = await getPerhitungan(id);
  if (run.usang.length) {
    throw new HttpError(
      409,
      `Perhitungan terakhir sudah tidak sesuai data (${run.usang.join('; ')}). Jalankan perhitungan ulang.`,
    );
  }
}
