import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { idParams, optionalQuery, pageQuery, searchQuery } from '../../utils/schemas.js';
import * as controller from './kk.controller.js';

export const kkRouter = Router();

// Both roles manage KK: Perangkat Desa for the whole village, Ketua RT only inside its own RT.
// That scoping is done in kk.service.js from req.user.rt, not by a role guard here.
kkRouter.use(requireAuth);

const kkBody = z.object({
  // Unique Restriction: one household = one 16-digit KK number
  noKk: z
    .string({ error: 'No. KK wajib diisi' })
    .trim()
    .regex(/^\d{16}$/, 'No. KK harus 16 digit angka'),
  kepalaKeluarga: z
    .string({ error: 'Nama kepala keluarga wajib diisi' })
    .trim()
    .min(1, 'Nama kepala keluarga wajib diisi')
    .max(100, 'Nama kepala keluarga maksimal 100 karakter'),
  alamat: z
    .string({ error: 'Alamat wajib diisi' })
    .trim()
    .min(1, 'Alamat wajib diisi')
    .max(255, 'Alamat maksimal 255 karakter'),
  jumlahAnggota: z
    .number({ error: 'Jumlah anggota keluarga wajib diisi' })
    .int('Jumlah anggota keluarga harus bilangan bulat')
    .min(1, 'Jumlah anggota keluarga minimal 1 orang')
    .max(50, 'Jumlah anggota keluarga maksimal 50 orang'),
  // Required for desa; RT accounts may omit it (the service always uses their own RT)
  rtId: z
    .number({ error: 'Wilayah RT tidak valid' })
    .int()
    .positive('Wilayah RT tidak valid')
    .optional(),
});

const listQuery = z.object({
  q: searchQuery,
  rtId: optionalQuery(z.coerce.number().int().positive()),
  // periodeId: only KK without a survei in that periode
  tanpaSurvei: optionalQuery(z.coerce.number().int().positive()),
  ...pageQuery,
});

// GET    /api/kk      ?q=&rtId=&tanpaSurvei=&page=&limit= → { data, meta }; RT accounts only get their own RT
kkRouter.get('/', validate({ query: listQuery }), controller.list);
// GET    /api/kk/:id  → 404 for a KK outside the RT account's wilayah
kkRouter.get('/:id', validate({ params: idParams }), controller.get);
// POST   /api/kk      { noKk, kepalaKeluarga, alamat, jumlahAnggota, rtId? }
kkRouter.post('/', validate({ body: kkBody }), controller.create);
// PATCH  /api/kk/:id  { noKk?, kepalaKeluarga?, alamat?, jumlahAnggota?, rtId? } (rtId: desa only)
kkRouter.patch('/:id', validate({ params: idParams, body: kkBody.partial() }), controller.update);
// DELETE /api/kk/:id  → only a KK without survei or hasil perhitungan
kkRouter.delete('/:id', validate({ params: idParams }), controller.remove);
