import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { idParams } from '../../utils/schemas.js';
import * as controller from './rt.controller.js';

export const rtRouter = Router();

// Wilayah RT is master data managed by Perangkat Desa. RT accounts get their own RT via /auth/me.
rtRouter.use(requireAuth, requireRole('desa'));

// "1" → "001"; stored as 3 digits so (no_rt, no_rw) stays unique regardless of how it was typed
function nomor(label) {
  return z
    .string({ error: `${label} wajib diisi` })
    .trim()
    .regex(/^\d{1,3}$/, `${label} berupa 1–3 digit angka`)
    .transform((value) => value.padStart(3, '0'))
    .refine((value) => value !== '000', `${label} tidak boleh 0`);
}

const rtBody = z.object({
  noRt: nomor('No. RT'),
  noRw: nomor('No. RW'),
});

// GET    /api/rt      → all RT with account & KK counts (small list, not paginated)
rtRouter.get('/', controller.list);
// GET    /api/rt/:id
rtRouter.get('/:id', validate({ params: idParams }), controller.get);
// POST   /api/rt      { noRt, noRw }
rtRouter.post('/', validate({ body: rtBody }), controller.create);
// PATCH  /api/rt/:id  { noRt?, noRw? }
rtRouter.patch('/:id', validate({ params: idParams, body: rtBody.partial() }), controller.update);
// DELETE /api/rt/:id  → only when no account or KK uses it
rtRouter.delete('/:id', validate({ params: idParams }), controller.remove);
