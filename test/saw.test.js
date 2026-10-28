import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SawError, hitungSaw, konversiNilai } from '../src/lib/saw.js';

// Seed criteria with the placeholder weights (open decision #2) and C1 as cost (as in the proposal)
const KRITERIA = [
  { kode: 'C1', sifat: 'cost', bobot: 0.3 },
  { kode: 'C2', sifat: 'benefit', bobot: 0.15 },
  { kode: 'C3', sifat: 'benefit', bobot: 0.2 },
  { kode: 'C4', sifat: 'benefit', bobot: 0.25 },
  { kode: 'C5', sifat: 'benefit', bobot: 0.1 },
];

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} expected ${expected}, got ${actual}`);
}

describe('konversiNilai', () => {
  const kriteria = [
    { kode: 'C1', pertanyaan: [{ id: 1, kode: '1' }] },
    { kode: 'C2', pertanyaan: [{ id: 2, kode: '2a' }, { id: 3, kode: '2b' }] },
    { kode: 'C4', pertanyaan: [{ id: 4, kode: '4a' }, { id: 5, kode: '4b' }, { id: 6, kode: '4c' }] },
  ];

  it('averages the scores of each criterion (Tabel 2.1)', () => {
    const nilai = konversiNilai(kriteria, { 1: 3, 2: 5, 3: 4, 4: 5, 5: 4, 6: 4 });
    assert.deepEqual(Object.keys(nilai), ['C1', 'C2', 'C4']);
    assert.equal(nilai.C1, 3);
    assert.equal(nilai.C2, 4.5);
    close(nilai.C4, 13 / 3);
  });

  it('refuses unanswered questions and names them', () => {
    assert.throws(
      () => konversiNilai(kriteria, { 1: 3, 2: 5, 4: 5 }),
      (err) => err instanceof SawError && err.message === 'Pertanyaan 2b belum dijawab',
    );
  });
});

describe('hitungSaw', () => {
  // Worked example, by hand:
  //   X        C1   C2   C3  C4  C5       min C1 = 1; max C2..C5 = 5
  //   A1        2  4.5    3   4   5   R = 0.50 0.90 0.60 0.80 1.00   V = 0.705
  //   A2        4    3    5   2   3   R = 0.25 0.60 1.00 0.40 0.60   V = 0.525
  //   A3        1    5    2   5   4   R = 1.00 1.00 0.40 1.00 0.80   V = 0.860
  //   A4        5    2    4   3   2   R = 0.20 0.40 0.80 0.60 0.40   V = 0.470
  //   ranking: A3, A1, A2, A4; kuota 2 → A3 and A1 layak
  const alternatif = [
    { id: 'A1', nilai: { C1: 2, C2: 4.5, C3: 3, C4: 4, C5: 5 } },
    { id: 'A2', nilai: { C1: 4, C2: 3, C3: 5, C4: 2, C5: 3 } },
    { id: 'A3', nilai: { C1: 1, C2: 5, C3: 2, C4: 5, C5: 4 } },
    { id: 'A4', nilai: { C1: 5, C2: 2, C3: 4, C4: 3, C5: 2 } },
  ];
  const { minmax, hasil } = hitungSaw({ kriteria: KRITERIA, alternatif, kuota: 2 });
  const byId = Object.fromEntries(hasil.map((h) => [h.id, h]));

  it('stores min and max of every criterion', () => {
    assert.deepEqual(minmax.C1, { min: 1, max: 5 });
    assert.deepEqual(minmax.C2, { min: 2, max: 5 });
  });

  it('normalizes benefit as x / max and cost as min / x', () => {
    close(byId.A1.normalisasi.C1, 0.5, 'cost 1/2');
    close(byId.A4.normalisasi.C1, 0.2, 'cost 1/5');
    close(byId.A1.normalisasi.C2, 0.9, 'benefit 4.5/5');
    close(byId.A2.normalisasi.C4, 0.4, 'benefit 2/5');
  });

  it('computes V = Σ w·r', () => {
    close(byId.A1.v, 0.705);
    close(byId.A2.v, 0.525);
    close(byId.A3.v, 0.86);
    close(byId.A4.v, 0.47);
  });

  it('ranks by V descending and marks the top kuota as layak', () => {
    assert.deepEqual(hasil.map((h) => h.id), ['A3', 'A1', 'A2', 'A4']);
    assert.deepEqual(hasil.map((h) => h.ranking), [1, 2, 3, 4]);
    assert.deepEqual(hasil.map((h) => h.layak), [true, true, false, false]);
    assert.ok(hasil.every((h) => !h.seri));
  });

  it('keeps the decision matrix X unchanged in the result', () => {
    assert.deepEqual(byId.A1.nilai, alternatif[0].nilai);
  });

  it('marks everyone layak when the kuota exceeds the alternatives', () => {
    const run = hitungSaw({ kriteria: KRITERIA, alternatif, kuota: 10 });
    assert.ok(run.hasil.every((h) => h.layak));
  });

  it('shows the C1 inversion of the deck: cost with 5 = most urgent favors the richest', () => {
    const c1 = [{ kode: 'C1', sifat: 'cost', bobot: 1 }];
    const run = hitungSaw({
      kriteria: c1,
      alternatif: [
        { id: 'KK A', nilai: { C1: 5 } },
        { id: 'KK B', nilai: { C1: 3 } },
        { id: 'KK C', nilai: { C1: 1 } },
      ],
      kuota: 1,
    });
    assert.deepEqual(run.hasil.map((h) => h.id), ['KK C', 'KK B', 'KK A']);
    close(run.hasil[2].normalisasi.C1, 0.2);
  });
});

describe('hitungSaw tie-break (provisional, open decision #4)', () => {
  it('decides equal V by r of the heaviest criterion first', () => {
    // K1 w .6, K2 w .4; max K1 = 5, max K2 = 5 (from R)
    //   P: r = 1.0, 0.2 → V = 0.68      Q: r = 0.6, 0.8 → V = 0.68      R: r = 0.2, 1.0 → V = 0.52
    // P and Q tie (also checks float noise: Q sums to 0.6800000000000001); P has the higher r on K1
    const { hasil } = hitungSaw({
      kriteria: [
        { kode: 'K1', sifat: 'benefit', bobot: 0.6 },
        { kode: 'K2', sifat: 'benefit', bobot: 0.4 },
      ],
      alternatif: [
        { id: 'Q', nilai: { K1: 3, K2: 4 } },
        { id: 'R', nilai: { K1: 1, K2: 5 } },
        { id: 'P', nilai: { K1: 5, K2: 1 } },
      ],
      kuota: 1,
    });
    assert.deepEqual(hasil.map((h) => h.id), ['P', 'Q', 'R']);
    assert.deepEqual(hasil.map((h) => h.seri), [true, true, false]);
    assert.equal(hasil[0].layak, true);
    assert.equal(hasil[1].layak, false);
  });

  it('then prefers more family members, then the smaller No. KK', () => {
    const nilai = { K1: 3 };
    const { hasil } = hitungSaw({
      kriteria: [{ kode: 'K1', sifat: 'benefit', bobot: 1 }],
      alternatif: [
        { id: 1, nilai, jumlahAnggota: 4, noKk: '3201000000000003' },
        { id: 2, nilai, jumlahAnggota: 6, noKk: '3201000000000009' },
        { id: 3, nilai, jumlahAnggota: 4, noKk: '3201000000000001' },
      ],
      kuota: 2,
    });
    assert.deepEqual(hasil.map((h) => h.id), [2, 3, 1]);
    assert.ok(hasil.every((h) => h.seri));
  });
});

describe('hitungSaw input checks', () => {
  const alternatif = [{ id: 1, nilai: { C1: 1, C2: 1, C3: 1, C4: 1, C5: 1 } }];

  it('requires Σ bobot = 1', () => {
    const kriteria = KRITERIA.map((k) => (k.kode === 'C5' ? { ...k, bobot: 0.2 } : k));
    assert.throws(() => hitungSaw({ kriteria, alternatif, kuota: 1 }), SawError);
  });

  it('accepts weights whose float sum is not exactly 1', () => {
    const kriteria = [
      { kode: 'K1', sifat: 'benefit', bobot: 0.1 },
      { kode: 'K2', sifat: 'benefit', bobot: 0.2 },
      { kode: 'K3', sifat: 'benefit', bobot: 0.7 },
    ];
    assert.doesNotThrow(() =>
      hitungSaw({ kriteria, alternatif: [{ id: 1, nilai: { K1: 1, K2: 1, K3: 1 } }], kuota: 1 }),
    );
  });

  it('requires at least one alternative', () => {
    assert.throws(() => hitungSaw({ kriteria: KRITERIA, alternatif: [], kuota: 1 }), SawError);
  });

  it('refuses a missing or non-positive value', () => {
    const bad = [{ id: 1, nilai: { C1: 0, C2: 1, C3: 1, C4: 1, C5: 1 } }];
    assert.throws(() => hitungSaw({ kriteria: KRITERIA, alternatif: bad, kuota: 1 }), SawError);
    const missing = [{ id: 1, nilai: { C1: 1 } }];
    assert.throws(() => hitungSaw({ kriteria: KRITERIA, alternatif: missing, kuota: 1 }), SawError);
  });
});
