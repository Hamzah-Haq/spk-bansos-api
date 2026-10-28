import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { photoUpload } from '../../lib/uploads.js';
import { idParams, optionalQuery, pageQuery, searchQuery } from '../../utils/schemas.js';
import * as controller from './survei.controller.js';

export const surveiRouter = Router();

// Both roles read surveys (Perangkat Desa verifies them); filling them in is the Ketua RT's job.
// An RT account only ever sees surveys of KK in its own RT (scoped in survei.service.js).
surveiRouter.use(requireAuth);
const rtOnly = requireRole('rt');

export const JENIS_FOTO = ['depan', 'lantai', 'dinding', 'atap', 'jamban', 'air'];

const id = z.coerce.number().int().positive('ID tidak valid');

const fotoParams = z.object({
  id,
  fotoId: id,
});

const listQuery = z.object({
  periodeId: optionalQuery(z.coerce.number().int().positive()),
  status: optionalQuery(z.enum(['draft', 'submitted', 'verified', 'rejected'])),
  rtId: optionalQuery(z.coerce.number().int().positive()),
  q: searchQuery,
  ...pageQuery,
});

const createBody = z.object({
  kkId: z.number({ error: 'KK wajib dipilih' }).int().positive('KK wajib dipilih'),
});

const jawabanBody = z.object({
  jawaban: z
    .array(
      z.object({
        pertanyaanId: z.number({ error: 'Pertanyaan tidak valid' }).int().positive(),
        opsiId: z.number({ error: 'Opsi jawaban wajib dipilih' }).int().positive(),
      }),
      { error: 'Daftar jawaban wajib diisi' },
    )
    .min(1, 'Daftar jawaban wajib diisi')
    .max(100)
    .refine(
      (items) => new Set(items.map((item) => item.pertanyaanId)).size === items.length,
      'Setiap pertanyaan hanya boleh dijawab sekali',
    ),
});

const fotoBody = z.object({
  jenis: z.enum(JENIS_FOTO, { error: `Jenis foto harus salah satu dari: ${JENIS_FOTO.join(', ')}` }),
});

// GET    /api/survei                     ?periodeId=&status=&rtId=&q=&page=&limit= → { data, meta }
surveiRouter.get('/', validate({ query: listQuery }), controller.list);
// GET    /api/survei/:id                 → with jawaban[] and foto[]
surveiRouter.get('/:id', validate({ params: idParams }), controller.get);
// POST   /api/survei                     { kkId } → draft in the open periode
surveiRouter.post('/', rtOnly, validate({ body: createBody }), controller.create);
// PUT    /api/survei/:id/jawaban         { jawaban: [{ pertanyaanId, opsiId }] } → upserts these answers
surveiRouter.put('/:id/jawaban', rtOnly, validate({ params: idParams, body: jawabanBody }), controller.saveJawaban);
// POST   /api/survei/:id/submit          → draft/rejected → submitted; every question must be answered
surveiRouter.post('/:id/submit', rtOnly, validate({ params: idParams }), controller.submit);
// DELETE /api/survei/:id                 → only a draft that was never submitted
surveiRouter.delete('/:id', rtOnly, validate({ params: idParams }), controller.remove);
// POST   /api/survei/:id/foto            multipart: file (JPEG/PNG/WebP ≤ 5 MB) + jenis → replaces that jenis
surveiRouter.post(
  '/:id/foto',
  rtOnly,
  photoUpload,
  validate({ params: idParams, body: fotoBody }),
  controller.uploadFoto,
);
// GET    /api/survei/:id/foto/:fotoId    → the image itself (same access rules as the survei)
surveiRouter.get('/:id/foto/:fotoId', validate({ params: fotoParams }), controller.fotoFile);
// DELETE /api/survei/:id/foto/:fotoId
surveiRouter.delete('/:id/foto/:fotoId', rtOnly, validate({ params: fotoParams }), controller.removeFoto);
