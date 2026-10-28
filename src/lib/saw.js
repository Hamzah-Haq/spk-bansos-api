// Simple Additive Weighting (proposal BAB II). Pure: no database or I/O, so it can be unit-tested
// and every number stored in a perhitungan can be recomputed by hand.
//
//   benefit: r = x / max(x)      cost: r = min(x) / x      (max/min over all alternatives of the run)
//   V = Σ wⱼ·rⱼ                  highest V = ranking 1; ranking ≤ kuota = layak

// nilai_v is stored as DECIMAL(6,4), so two V values count as equal at the precision people see
export const PRESISI_V = 4;

export class SawError extends Error {}

function bulatkan(value, digits = PRESISI_V) {
  return Number(value.toFixed(digits));
}

// Criterion value X from the 1–5 answer scores: the average of its questions (proposal Tabel 2.1,
// e.g. C2 = (2a + 2b) / 2). kriteria: [{ kode, pertanyaan: [{ id, kode }] }]; skor: { [pertanyaanId]: 1–5 }
export function konversiNilai(kriteria, skor) {
  const nilai = {};
  for (const k of kriteria) {
    if (!k.pertanyaan.length) throw new SawError(`Kriteria ${k.kode} belum memiliki pertanyaan`);

    const skorKriteria = k.pertanyaan.map((p) => skor[p.id]);
    const kosong = k.pertanyaan.filter((p, i) => skorKriteria[i] == null).map((p) => p.kode);
    if (kosong.length) throw new SawError(`Pertanyaan ${kosong.join(', ')} belum dijawab`);

    nilai[k.kode] = skorKriteria.reduce((sum, s) => sum + s, 0) / skorKriteria.length;
  }
  return nilai;
}

function assertInput(kriteria, alternatif) {
  if (!kriteria.length) throw new SawError('Belum ada kriteria');
  if (!alternatif.length) throw new SawError('Belum ada alternatif (survei terverifikasi) untuk dihitung');

  // Thousandths, like the bobot editor, so 0.1 + 0.2 style float error can't fail the check
  const total = kriteria.reduce((sum, k) => sum + Math.round(k.bobot * 1000), 0);
  if (total !== 1000) {
    throw new SawError(`Total bobot kriteria harus 1,000 (saat ini ${(total / 1000).toFixed(3).replace('.', ',')})`);
  }
  for (const k of kriteria) {
    if (k.sifat !== 'benefit' && k.sifat !== 'cost') throw new SawError(`Sifat kriteria ${k.kode} tidak valid`);
  }
  for (const a of alternatif) {
    for (const k of kriteria) {
      const x = a.nilai[k.kode];
      // Scores are 1–5, so x > 0 always holds for valid data; cost needs it (min / x)
      if (!Number.isFinite(x) || x <= 0) {
        throw new SawError(`Nilai ${k.kode} alternatif ${a.label ?? a.id} tidak valid`);
      }
    }
  }
}

// TODO(tie-break): PROVISIONAL rule, open decision #4 in the workspace CLAUDE.md. Equal V (at PRESISI_V)
// is decided by, in order: higher r on the criteria from the largest bobot down (kode on equal bobot),
// then more family members, then the smaller No. KK (only so the order is always reproducible).
function tieBreakOrder(kriteria) {
  return [...kriteria].sort((a, b) => b.bobot - a.bobot || a.kode.localeCompare(b.kode));
}

function bandingkan(urutanKriteria) {
  return (a, b) => {
    const selisihV = bulatkan(b.v) - bulatkan(a.v);
    if (selisihV) return selisihV;
    for (const k of urutanKriteria) {
      const selisihR = b.normalisasi[k.kode] - a.normalisasi[k.kode];
      if (selisihR) return selisihR;
    }
    const selisihAnggota = (b.jumlahAnggota ?? 0) - (a.jumlahAnggota ?? 0);
    if (selisihAnggota) return selisihAnggota;
    return String(a.noKk ?? a.id).localeCompare(String(b.noKk ?? b.id));
  };
}

// kriteria:   [{ kode, sifat: 'benefit' | 'cost', bobot }]      (Σ bobot = 1)
// alternatif: [{ id, nilai: { C1: x, ... }, jumlahAnggota?, noKk?, label? }]
// kuota:      number of recipients
// → { minmax: { C1: { min, max } }, hasil: [{ id, nilai, normalisasi, v, ranking, layak, seri }] } by ranking
export function hitungSaw({ kriteria, alternatif, kuota }) {
  assertInput(kriteria, alternatif);

  const minmax = {};
  for (const k of kriteria) {
    const xs = alternatif.map((a) => a.nilai[k.kode]);
    minmax[k.kode] = {
      min: Math.min(...xs),
      max: Math.max(...xs),
    };
  }

  const dihitung = alternatif.map((a) => {
    const normalisasi = {};
    let v = 0;
    for (const k of kriteria) {
      const x = a.nilai[k.kode];
      const { min, max } = minmax[k.kode];
      const r = k.sifat === 'benefit' ? x / max : min / x;
      normalisasi[k.kode] = r;
      v += k.bobot * r;
    }
    return {
      ...a,
      nilai: { ...a.nilai },
      normalisasi,
      v,
    };
  });

  dihitung.sort(bandingkan(tieBreakOrder(kriteria)));

  const jumlahPerV = new Map();
  for (const a of dihitung) {
    const key = bulatkan(a.v);
    jumlahPerV.set(key, (jumlahPerV.get(key) ?? 0) + 1);
  }

  const hasil = dihitung.map((a, i) => ({
    id: a.id,
    nilai: a.nilai,
    normalisasi: a.normalisasi,
    v: a.v,
    ranking: i + 1,
    layak: i < kuota,
    // Its place among equal V was decided by the tie-break rule, not by V itself
    seri: jumlahPerV.get(bulatkan(a.v)) > 1,
  }));

  return {
    minmax,
    hasil,
  };
}
