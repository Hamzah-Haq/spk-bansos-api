import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hitungSaw, konversiNilai } from '../src/lib/saw.js';
import { JAWABAN_DUMMY, KUOTA_DUMMY, OPSI_DUMMY } from '../prisma/dummy-data.js';

// The ranking the dummy seed (npm run db:seed:dummy) should produce in the app with the seed's
// placeholder weights and C1 as cost. Keeps the walkthrough given to the team in sync with the code.
const KRITERIA = [
  { kode: 'C1', sifat: 'cost', bobot: 0.3, pertanyaan: ['1'] },
  { kode: 'C2', sifat: 'benefit', bobot: 0.15, pertanyaan: ['2a', '2b'] },
  { kode: 'C3', sifat: 'benefit', bobot: 0.2, pertanyaan: ['3a', '3b'] },
  { kode: 'C4', sifat: 'benefit', bobot: 0.25, pertanyaan: ['4a', '4b', '4c'] },
  { kode: 'C5', sifat: 'benefit', bobot: 0.1, pertanyaan: ['5a', '5b'] },
].map((k) => ({ ...k, pertanyaan: k.pertanyaan.map((kode) => ({ id: kode, kode })) }));

describe('dummy data', () => {
  it('answers every question with a score that has an option', () => {
    for (const [nama, skor] of Object.entries(JAWABAN_DUMMY)) {
      for (const [kode, opsi] of Object.entries(OPSI_DUMMY)) {
        assert.ok(
          opsi.some((o) => o.skor === skor[kode]),
          `${nama}: pertanyaan ${kode} skor ${skor[kode]}`,
        );
      }
    }
  });

  it('ranks the seed KK as in the walkthrough', () => {
    const alternatif = Object.entries(JAWABAN_DUMMY).map(([nama, skor]) => ({
      id: nama,
      nilai: konversiNilai(KRITERIA, skor),
    }));
    const { hasil } = hitungSaw({ kriteria: KRITERIA, alternatif, kuota: KUOTA_DUMMY });

    assert.deepEqual(
      hasil.map((h) => [h.id, Number(h.v.toFixed(4)), h.layak]),
      [
        ['Nur Aini', 0.85, true],
        ['Siti Rahmawati', 0.78, true],
        ['Joko Prasetyo', 0.6933, true],
        ['Dewi Lestari', 0.5533, true],
        ['Ahmad Suryadi', 0.5067, false],
        ['Sri Wahyuni', 0.4967, false],
        ['Agus Salim', 0.4767, false],
        ['Bambang Hartono', 0.2983, false],
        ['Hendra Gunawan', 0.2433, false],
      ],
    );
  });
});
