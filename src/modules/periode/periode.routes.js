import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { idParams, optionalQuery } from '../../utils/schemas.js';
import * as controller from './periode.controller.js';

export const periodeRouter = Router();

// Both roles read periode (RT needs the open one for surveys); only Perangkat Desa changes it.
periodeRouter.use(requireAuth);
const desaOnly = requireRole('desa');

const status = z.enum(['open', 'closed', 'final'], { error: 'Status harus open, closed, atau final' });

const periodeBody = z.object({
  nama: z
    .string({ error: 'Nama periode wajib diisi' })
    .trim()
    .min(1, 'Nama periode wajib diisi')
    .max(100, 'Nama periode maksimal 100 karakter'),
  tahun: z
    .number({ error: 'Tahun wajib diisi' })
    .int('Tahun harus bilangan bulat')
    .min(2000, 'Tahun minimal 2000')
    .max(2100, 'Tahun maksimal 2100'),
  kuota: z
    .number({ error: 'Kuota wajib diisi' })
    .int('Kuota harus bilangan bulat')
    .min(1, 'Kuota minimal 1 KK')
    .max(100000, 'Kuota terlalu besar'),
});

const listQuery = z.object({
  status: optionalQuery(status),
});

// GET    /api/periode            ?status= → newest first, with survei counts (small list, not paginated)
periodeRouter.get('/', validate({ query: listQuery }), controller.list);
// GET    /api/periode/:id
periodeRouter.get('/:id', validate({ params: idParams }), controller.get);
// POST   /api/periode            { nama, tahun, kuota } → created as open
periodeRouter.post('/', desaOnly, validate({ body: periodeBody }), controller.create);
// PATCH  /api/periode/:id        { nama?, tahun?, kuota? } → not allowed once final
periodeRouter.patch(
  '/:id',
  desaOnly,
  validate({ params: idParams, body: periodeBody.partial() }),
  controller.update,
);
// PATCH  /api/periode/:id/status { status } → open ⇄ closed → final
periodeRouter.patch(
  '/:id/status',
  desaOnly,
  validate({ params: idParams, body: z.object({ status }) }),
  controller.changeStatus,
);
// DELETE /api/periode/:id        → only when it has no survei or perhitungan
periodeRouter.delete('/:id', desaOnly, validate({ params: idParams }), controller.remove);
