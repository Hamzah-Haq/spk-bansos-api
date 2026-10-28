// Fictional seed data (proposal scope: simulation only). Idempotent — safe to re-run.
// Run: npm run db:seed
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'password123';

const RT_LIST = [
  { noRt: '001', noRw: '001' },
  { noRt: '002', noRw: '001' },
  { noRt: '003', noRw: '001' },
];

// Source: proposal Tabel 2.1.
// TODO(C1): sifat & scale of C1 are pending the team's decision (see CLAUDE.md "Open decisions").
// TODO(bobot): weights are placeholders until the team confirms them; they must sum to 1.00.
const KRITERIA = [
  {
    kode: 'C1',
    nama: 'Pendapatan total keluarga',
    sifat: 'cost',
    bobot: 0.3,
    pertanyaan: [
      { kode: '1', teks: 'Total pendapatan kotor seluruh anggota keluarga dalam satu bulan.' },
    ],
  },
  {
    kode: 'C2',
    nama: 'Status pekerjaan & kerentanan',
    sifat: 'benefit',
    bobot: 0.15,
    pertanyaan: [
      { kode: '2a', teks: 'Status pekerjaan utama kepala keluarga.' },
      { kode: '2b', teks: 'Keberadaan anggota keluarga produktif yang PHK/menganggur.' },
    ],
  },
  {
    kode: 'C3',
    nama: 'Beban tanggungan pendidikan anak',
    sifat: 'benefit',
    bobot: 0.2,
    pertanyaan: [
      { kode: '3a', teks: 'Jumlah anak yang aktif bersekolah (TK–Kuliah).' },
      { kode: '3b', teks: 'Keberadaan anak usia sekolah yang putus sekolah.' },
    ],
  },
  {
    kode: 'C4',
    nama: 'Kondisi fisik bangunan rumah',
    sifat: 'benefit',
    bobot: 0.25,
    pertanyaan: [
      { kode: '4a', teks: 'Jenis material lantai terluas.' },
      { kode: '4b', teks: 'Jenis material dinding terluas.' },
      { kode: '4c', teks: 'Kondisi umum kelayakan atap rumah.' },
    ],
  },
  {
    kode: 'C5',
    nama: 'Kualitas sanitasi & kualitas air',
    sifat: 'benefit',
    bobot: 0.1,
    pertanyaan: [
      { kode: '5a', teks: 'Fasilitas buang air besar (jamban).' },
      { kode: '5b', teks: 'Sumber air utama untuk minum/masak.' },
    ],
  },
];
// TODO(opsi): answer options + 1–5 scores per question are not defined in the proposal yet.

// Fictional households, three per RT (all in RW 001). KK numbers are made up: 320101010126 + seq.
const KK_LIST = [
  { noRt: '001', kepalaKeluarga: 'Ahmad Suryadi', alamat: 'Jl. Melati No. 3', jumlahAnggota: 5 },
  { noRt: '001', kepalaKeluarga: 'Siti Rahmawati', alamat: 'Jl. Melati No. 12', jumlahAnggota: 3 },
  { noRt: '001', kepalaKeluarga: 'Bambang Hartono', alamat: 'Gg. Kenanga No. 7', jumlahAnggota: 6 },
  { noRt: '002', kepalaKeluarga: 'Dewi Lestari', alamat: 'Jl. Mawar No. 5', jumlahAnggota: 4 },
  { noRt: '002', kepalaKeluarga: 'Joko Prasetyo', alamat: 'Jl. Mawar No. 21', jumlahAnggota: 2 },
  { noRt: '002', kepalaKeluarga: 'Nur Aini', alamat: 'Gg. Anggrek No. 2', jumlahAnggota: 7 },
  { noRt: '003', kepalaKeluarga: 'Hendra Gunawan', alamat: 'Jl. Flamboyan No. 9', jumlahAnggota: 4 },
  { noRt: '003', kepalaKeluarga: 'Sri Wahyuni', alamat: 'Jl. Flamboyan No. 15', jumlahAnggota: 5 },
  { noRt: '003', kepalaKeluarga: 'Agus Salim', alamat: 'Gg. Dahlia No. 4', jumlahAnggota: 3 },
];

async function seedWilayahDanAkun() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  await prisma.user.upsert({
    where: { username: 'admin.desa' },
    update: {},
    create: { username: 'admin.desa', passwordHash, nama: 'Admin Kantor Desa', role: 'desa' },
  });

  for (const { noRt, noRw } of RT_LIST) {
    const rt = await prisma.rt.upsert({
      where: { noRt_noRw: { noRt, noRw } },
      update: {},
      create: { noRt, noRw },
    });

    const username = `rt${noRt}.rw${noRw}`;
    await prisma.user.upsert({
      where: { username },
      update: {},
      create: {
        username,
        passwordHash,
        nama: `Ketua RT ${noRt}/RW ${noRw}`,
        role: 'rt',
        rtId: rt.id,
      },
    });
  }
}

async function seedKartuKeluarga() {
  for (const [index, { noRt, ...kk }] of KK_LIST.entries()) {
    const rt = await prisma.rt.findUnique({ where: { noRt_noRw: { noRt, noRw: '001' } } });
    const noKk = `320101010126${String(index + 1).padStart(4, '0')}`;
    await prisma.kartuKeluarga.upsert({
      where: { noKk },
      update: {},
      create: { ...kk, noKk, rtId: rt.id },
    });
  }
}

async function seedKriteria() {
  for (const { pertanyaan, ...kriteria } of KRITERIA) {
    const saved = await prisma.kriteria.upsert({
      where: { kode: kriteria.kode },
      update: { nama: kriteria.nama, sifat: kriteria.sifat },
      create: kriteria,
    });

    for (const [index, p] of pertanyaan.entries()) {
      await prisma.pertanyaan.upsert({
        where: { kode: p.kode },
        update: { teks: p.teks, urutan: index + 1, kriteriaId: saved.id },
        create: { ...p, urutan: index + 1, kriteriaId: saved.id },
      });
    }
  }
}

async function seedPeriode() {
  const nama = 'Simulasi Bansos 2026';
  const existing = await prisma.periode.findFirst({ where: { nama } });
  if (!existing) {
    await prisma.periode.create({ data: { nama, tahun: 2026, kuota: 10 } });
  }
}

try {
  await seedWilayahDanAkun();
  await seedKartuKeluarga();
  await seedKriteria();
  await seedPeriode();
  console.log(
    `Seed selesai. Akun: admin.desa, rt001.rw001..rt003.rw001 (password: ${SEED_PASSWORD}); ` +
      `${KK_LIST.length} KK contoh`,
  );
} finally {
  await prisma.$disconnect();
}
