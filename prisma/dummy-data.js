// DUMMY questionnaire options + survey answers, for testing only (npm run db:seed:dummy).
// NOT the team's decision: open decisions #1 (C1 scale) and #3 (options & scores) are still open.
//
// Scale: 5 = most urgent for every question EXCEPT question 1 (C1), which follows option C of the
// C1 deck: C1 stays cost and its scale is reversed, 1 = lowest income. Without that, cost + "5 = most
// urgent" would rank the richest family highest on C1.

export const KUOTA_DUMMY = 4;

// Per question code: options in display order, each { label, skor }
export const OPSI_DUMMY = {
  1: [
    { label: 'Kurang dari Rp1.000.000', skor: 1 },
    { label: 'Rp1.000.000 – Rp1.999.999', skor: 2 },
    { label: 'Rp2.000.000 – Rp2.999.999', skor: 3 },
    { label: 'Rp3.000.000 – Rp4.999.999', skor: 4 },
    { label: 'Rp5.000.000 atau lebih', skor: 5 },
  ],
  '2a': [
    { label: 'Tidak bekerja', skor: 5 },
    { label: 'Buruh harian lepas / serabutan', skor: 4 },
    { label: 'Petani, nelayan, atau pedagang kecil', skor: 3 },
    { label: 'Karyawan kontrak', skor: 2 },
    { label: 'PNS/TNI/Polri atau karyawan tetap', skor: 1 },
  ],
  '2b': [
    { label: 'Ya, ada', skor: 5 },
    { label: 'Tidak ada', skor: 1 },
  ],
  '3a': [
    { label: '4 anak atau lebih', skor: 5 },
    { label: '3 anak', skor: 4 },
    { label: '2 anak', skor: 3 },
    { label: '1 anak', skor: 2 },
    { label: 'Tidak ada', skor: 1 },
  ],
  '3b': [
    { label: 'Ya, ada', skor: 5 },
    { label: 'Tidak ada', skor: 1 },
  ],
  '4a': [
    { label: 'Tanah', skor: 5 },
    { label: 'Bambu / papan kayu murah', skor: 4 },
    { label: 'Semen / plester', skor: 3 },
    { label: 'Ubin / tegel', skor: 2 },
    { label: 'Keramik / granit', skor: 1 },
  ],
  '4b': [
    { label: 'Bambu / anyaman / kayu murah', skor: 5 },
    { label: 'Papan kayu', skor: 4 },
    { label: 'Tembok tanpa plester', skor: 3 },
    { label: 'Tembok diplester, belum dicat', skor: 2 },
    { label: 'Tembok diplester dan dicat', skor: 1 },
  ],
  '4c': [
    { label: 'Rusak berat, bocor di banyak titik', skor: 5 },
    { label: 'Rusak sedang', skor: 4 },
    { label: 'Rusak ringan', skor: 3 },
    { label: 'Baik, perlu perawatan', skor: 2 },
    { label: 'Baik', skor: 1 },
  ],
  '5a': [
    { label: 'Tidak ada (sungai/kebun)', skor: 5 },
    { label: 'Menumpang tetangga', skor: 4 },
    { label: 'Jamban umum / bersama', skor: 3 },
    { label: 'Jamban sendiri tanpa septic tank', skor: 2 },
    { label: 'Jamban sendiri dengan septic tank', skor: 1 },
  ],
  '5b': [
    { label: 'Sungai / mata air tidak terlindungi', skor: 5 },
    { label: 'Air hujan', skor: 4 },
    { label: 'Sumur tidak terlindungi', skor: 3 },
    { label: 'Sumur terlindungi / sumur bor', skor: 2 },
    { label: 'PDAM / air kemasan', skor: 1 },
  ],
};

// One verified survey per seed KK (matched by kepala keluarga): the score chosen per question
export const JAWABAN_DUMMY = {
  'Ahmad Suryadi': { 1: 2, '2a': 4, '2b': 1, '3a': 4, '3b': 1, '4a': 3, '4b': 2, '4c': 3, '5a': 2, '5b': 2 },
  'Siti Rahmawati': { 1: 1, '2a': 5, '2b': 1, '3a': 2, '3b': 1, '4a': 5, '4b': 5, '4c': 5, '5a': 4, '5b': 3 },
  'Bambang Hartono': { 1: 4, '2a': 1, '2b': 1, '3a': 5, '3b': 1, '4a': 1, '4b': 1, '4c': 1, '5a': 1, '5b': 1 },
  'Dewi Lestari': { 1: 2, '2a': 3, '2b': 5, '3a': 3, '3b': 1, '4a': 2, '4b': 3, '4c': 4, '5a': 2, '5b': 2 },
  'Joko Prasetyo': { 1: 1, '2a': 5, '2b': 1, '3a': 1, '3b': 1, '4a': 3, '4b': 4, '4c': 4, '5a': 3, '5b': 4 },
  'Nur Aini': { 1: 2, '2a': 4, '2b': 5, '3a': 5, '3b': 5, '4a': 5, '4b': 5, '4c': 5, '5a': 5, '5b': 5 },
  'Hendra Gunawan': { 1: 5, '2a': 1, '2b': 1, '3a': 3, '3b': 1, '4a': 1, '4b': 1, '4c': 1, '5a': 1, '5b': 1 },
  'Sri Wahyuni': { 1: 3, '2a': 3, '2b': 1, '3a': 4, '3b': 5, '4a': 2, '4b': 2, '4c': 2, '5a': 2, '5b': 3 },
  'Agus Salim': { 1: 3, '2a': 2, '2b': 5, '3a': 2, '3b': 1, '4a': 3, '4b': 3, '4c': 3, '5a': 3, '5b': 2 },
};
