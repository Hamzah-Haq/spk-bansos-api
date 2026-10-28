import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { idParams, optionalQuery } from '../../utils/schemas.js';
import * as controller from './perhitungan.controller.js';

export const perhitunganRouter = Router();

// Running SAW and reading the ranking is the Perangkat Desa's job (proposal: RT only collects data).
perhitunganRouter.use(requireAuth, requireRole('desa'));

const listQuery = z.object({
  periodeId: optionalQuery(z.coerce.number().int().positive()),
});

const runBody = z.object({
  periodeId: z.number({ error: 'Periode wajib dipilih' }).int().positive('Periode wajib dipilih'),
});

// GET  /api/perhitungan        ?periodeId= → { data: [runs, newest first, with terbaru] }
perhitunganRouter.get('/', validate({ query: listQuery }), controller.list);
// GET  /api/perhitungan/:id    → snapshot: kriteria (bobot, sifat, min, max), hasil[] by ranking, usang[]
perhitunganRouter.get('/:id', validate({ params: idParams }), controller.get);
// POST /api/perhitungan        { periodeId } → runs SAW on the verified surveys of that periode
perhitunganRouter.post('/', validate({ body: runBody }), controller.run);
