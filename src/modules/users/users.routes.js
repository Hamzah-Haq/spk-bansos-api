import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { idParams, optionalQuery, pageQuery, password, searchQuery } from '../../utils/schemas.js';
import * as controller from './users.controller.js';

export const usersRouter = Router();

// Account management is a Perangkat Desa feature only.
usersRouter.use(requireAuth, requireRole('desa'));

const username = z
  .string({ error: 'Username wajib diisi' })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,50}$/, 'Username 3–50 karakter: huruf kecil, angka, titik (.), garis bawah (_), atau strip (-)');

const nama = z
  .string({ error: 'Nama wajib diisi' })
  .trim()
  .min(1, 'Nama wajib diisi')
  .max(100, 'Nama maksimal 100 karakter');

const role = z.enum(['desa', 'rt'], { error: 'Jabatan harus desa atau rt' });

// null = no wilayah (desa accounts); the service checks it is set for role rt
const rtId = z.number({ error: 'Wilayah RT tidak valid' }).int().positive().nullable();

const listQuery = z.object({
  q: searchQuery,
  role: optionalQuery(role),
  rtId: optionalQuery(z.coerce.number().int().positive()),
  status: optionalQuery(z.enum(['aktif', 'nonaktif'])),
  ...pageQuery,
});

const createBody = z.object({
  username,
  nama,
  password,
  role,
  rtId: rtId.optional(),
});

const updateBody = z.object({
  username: username.optional(),
  nama: nama.optional(),
  role: role.optional(),
  rtId: rtId.optional(),
  isActive: z.boolean({ error: 'Status aktif harus true atau false' }).optional(),
});

const passwordBody = z.object({ password });

// GET    /api/users               ?q=&role=&rtId=&status=aktif|nonaktif&page=&limit= → { data, meta }
usersRouter.get('/', validate({ query: listQuery }), controller.list);
// GET    /api/users/:id
usersRouter.get('/:id', validate({ params: idParams }), controller.get);
// POST   /api/users               { username, nama, password, role, rtId? }
usersRouter.post('/', validate({ body: createBody }), controller.create);
// PATCH  /api/users/:id           { username?, nama?, role?, rtId?, isActive? }
usersRouter.patch('/:id', validate({ params: idParams, body: updateBody }), controller.update);
// PUT    /api/users/:id/password  { password } → reset by admin; logs that user out everywhere
usersRouter.put('/:id/password', validate({ params: idParams, body: passwordBody }), controller.resetPassword);
// DELETE /api/users/:id           → only accounts without survei/perhitungan history
usersRouter.delete('/:id', validate({ params: idParams }), controller.remove);
