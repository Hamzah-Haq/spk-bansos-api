import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { idParams } from '../../utils/schemas.js';
import * as controller from './pertanyaan.controller.js';
import { MIN_OPSI } from './pertanyaan.service.js';

export const pertanyaanRouter = Router();

// Editing the questionnaire is a Perangkat Desa feature; everyone reads it via GET /api/kriteria.
pertanyaanRouter.use(requireAuth, requireRole('desa'));

// Proposal numbering: 1, 2a, 2b, ... (stored lowercase)
const kode = z
  .string({ error: 'Kode pertanyaan wajib diisi' })
  .trim()
  .toLowerCase()
  .regex(/^\d{1,2}[a-z]?$/, 'Kode berupa nomor dengan huruf opsional, misalnya 1, 2a, atau 4c');

const teks = z
  .string({ error: 'Teks pertanyaan wajib diisi' })
  .trim()
  .min(1, 'Teks pertanyaan wajib diisi')
  .max(500, 'Teks pertanyaan maksimal 500 karakter');

const createBody = z.object({
  kriteriaId: z.number({ error: 'Kriteria wajib dipilih' }).int().positive('Kriteria wajib dipilih'),
  kode,
  teks,
});

const updateBody = z.object({
  kode: kode.optional(),
  teks: teks.optional(),
});

const opsiItem = z.object({
  // Present = keep/update that option, absent = new option
  id: z.number().int().positive().optional(),
  label: z
    .string({ error: 'Label opsi wajib diisi' })
    .trim()
    .min(1, 'Label opsi wajib diisi')
    .max(200, 'Label opsi maksimal 200 karakter'),
  skor: z
    .number({ error: 'Skor wajib diisi' })
    .int('Skor harus bilangan bulat')
    .min(1, 'Skor minimal 1')
    .max(5, 'Skor maksimal 5'),
});

const opsiBody = z.object({
  opsi: z
    .array(opsiItem, { error: 'Daftar opsi wajib diisi' })
    .min(MIN_OPSI, `Minimal ${MIN_OPSI} opsi jawaban`)
    .max(10, 'Maksimal 10 opsi jawaban')
    .refine(
      (items) => new Set(items.map((o) => o.label.toLowerCase())).size === items.length,
      'Label opsi tidak boleh sama',
    ),
});

// POST   /api/pertanyaan          { kriteriaId, kode, teks } → appended at the end of its kriteria
pertanyaanRouter.post('/', validate({ body: createBody }), controller.create);
// PATCH  /api/pertanyaan/:id      { kode?, teks? }
pertanyaanRouter.patch('/:id', validate({ params: idParams, body: updateBody }), controller.update);
// DELETE /api/pertanyaan/:id      → not the last one of its kriteria, not once answered
pertanyaanRouter.delete('/:id', validate({ params: idParams }), controller.remove);
// PUT    /api/pertanyaan/:id/opsi { opsi: [{ id?, label, skor }] } → replaces the list in this order
pertanyaanRouter.put('/:id/opsi', validate({ params: idParams, body: opsiBody }), controller.replaceOpsi);
