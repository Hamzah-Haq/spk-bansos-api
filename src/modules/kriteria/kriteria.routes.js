import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { idParams } from '../../utils/schemas.js';
import * as controller from './kriteria.controller.js';

export const kriteriaRouter = Router();

// Both roles read the criteria + questionnaire (RT fills it in surveys); only Perangkat Desa edits.
// The set of criteria is fixed by the proposal (Tabel 2.1: C1–C5), so there is no create/delete.
kriteriaRouter.use(requireAuth);
const desaOnly = requireRole('desa');

const kriteriaBody = z.object({
  nama: z
    .string({ error: 'Nama kriteria wajib diisi' })
    .trim()
    .min(1, 'Nama kriteria wajib diisi')
    .max(100, 'Nama kriteria maksimal 100 karakter')
    .optional(),
  sifat: z.enum(['benefit', 'cost'], { error: 'Sifat harus benefit atau cost' }).optional(),
});

// kriteria.bobot is Decimal(4, 3)
const bobot = z
  .number({ error: 'Bobot wajib diisi' })
  .gt(0, 'Bobot harus lebih dari 0')
  .max(1, 'Bobot maksimal 1')
  .refine(
    (value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6,
    'Bobot maksimal 3 angka di belakang koma',
  );

const bobotBody = z.object({
  bobot: z
    .array(
      z.object({
        id: z.number({ error: 'Kriteria tidak valid' }).int().positive(),
        bobot,
      }),
      { error: 'Daftar bobot wajib diisi' },
    )
    .min(1, 'Daftar bobot wajib diisi')
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      'Kriteria tidak boleh ganda',
    ),
});

// GET   /api/kriteria        → C1–C5 with pertanyaan + opsi; meta = { totalBobot, kuesionerTerkunci }
kriteriaRouter.get('/', controller.list);
// PUT   /api/kriteria/bobot  { bobot: [{ id, bobot }] } → all criteria at once, Σ bobot must be 1.000
kriteriaRouter.put('/bobot', desaOnly, validate({ body: bobotBody }), controller.updateBobot);
// PATCH /api/kriteria/:id    { nama?, sifat? }
kriteriaRouter.patch('/:id', desaOnly, validate({ params: idParams, body: kriteriaBody }), controller.update);
