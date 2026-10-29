// DUMMY data for testing the survey → verification → SAW flow without waiting for the team's
// answer options (open decision #3). Run after `npm run db:seed`: npm run db:seed:dummy
//
// 1. Adds the options of prisma/dummy-data.js to every question that has none yet.
// 2. Creates a VERIFIED survey for each seed KK in the open periode (skips KK already surveyed there).
// 3. Sets that periode's kuota to KUOTA_DUMMY so the ranking has both layak and tidak layak.
// It does not run SAW: press "Jalankan Perhitungan" on the Perhitungan SAW page.
// Refuses to touch a question whose options differ from the dummy ones (real options entered).
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { JAWABAN_DUMMY, KUOTA_DUMMY, OPSI_DUMMY } from './dummy-data.js';

async function seedOpsi() {
  const pertanyaan = await prisma.pertanyaan.findMany({
    select: {
      id: true,
      kode: true,
      opsi: { select: { id: true, label: true, skor: true } },
    },
  });

  const opsiByKode = {};
  for (const p of pertanyaan) {
    const dummy = OPSI_DUMMY[p.kode];
    if (!dummy) throw new Error(`Pertanyaan ${p.kode} tidak ada di data dummy`);

    if (p.opsi.length) {
      const sama =
        p.opsi.length === dummy.length &&
        dummy.every((d) => p.opsi.some((o) => o.label === d.label && o.skor === d.skor));
      if (!sama) {
        throw new Error(`Pertanyaan ${p.kode} sudah punya opsi yang bukan dummy; seed dummy dibatalkan`);
      }
      opsiByKode[p.kode] = p.opsi;
      continue;
    }

    await prisma.opsiJawaban.createMany({
      data: dummy.map((d, index) => ({
        pertanyaanId: p.id,
        label: d.label,
        skor: d.skor,
        urutan: index + 1,
      })),
    });
    opsiByKode[p.kode] = await prisma.opsiJawaban.findMany({
      where: { pertanyaanId: p.id },
      select: { id: true, label: true, skor: true },
    });
  }
  return {
    pertanyaan,
    opsiByKode,
  };
}

async function seedSurvei(periode, { pertanyaan, opsiByKode }) {
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin.desa' } });
  const kkList = await prisma.kartuKeluarga.findMany({
    where: { kepalaKeluarga: { in: Object.keys(JAWABAN_DUMMY) } },
    select: {
      id: true,
      kepalaKeluarga: true,
      rtId: true,
      survei: { where: { periodeId: periode.id }, select: { id: true } },
    },
  });

  let dibuat = 0;
  for (const kk of kkList) {
    if (kk.survei.length) continue;

    const surveyor = await prisma.user.findFirstOrThrow({ where: { role: 'rt', rtId: kk.rtId } });
    const jawaban = pertanyaan.map((p) => {
      const skor = JAWABAN_DUMMY[kk.kepalaKeluarga][p.kode];
      const opsi = opsiByKode[p.kode].find((o) => o.skor === skor);
      if (!opsi) throw new Error(`Tidak ada opsi skor ${skor} untuk pertanyaan ${p.kode}`);
      return {
        pertanyaanId: p.id,
        opsiId: opsi.id,
        skor,
      };
    });

    const now = new Date();
    await prisma.survei.create({
      data: {
        kkId: kk.id,
        periodeId: periode.id,
        surveyorId: surveyor.id,
        status: 'verified',
        submittedAt: now,
        verifiedAt: now,
        verifiedById: admin.id,
        jawaban: { create: jawaban },
      },
    });
    dibuat += 1;
  }
  return dibuat;
}

try {
  const periode = await prisma.periode.findFirst({ where: { status: 'open' } });
  if (!periode) throw new Error('Tidak ada periode yang dibuka. Jalankan `npm run db:seed` atau buka periode dulu.');

  const kuesioner = await seedOpsi();
  const dibuat = await seedSurvei(periode, kuesioner);
  await prisma.periode.update({ where: { id: periode.id }, data: { kuota: KUOTA_DUMMY } });

  console.log(
    `Seed dummy selesai: opsi jawaban dummy untuk ${kuesioner.pertanyaan.length} pertanyaan, ` +
      `${dibuat} survei terverifikasi baru di periode "${periode.nama}", kuota ${KUOTA_DUMMY} KK. ` +
      'Jalankan perhitungan dari menu Perhitungan SAW.',
  );
} finally {
  await prisma.$disconnect();
}
