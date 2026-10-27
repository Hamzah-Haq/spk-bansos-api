import * as usersService from './users.service.js';

export async function list(req, res) {
  res.json(await usersService.listUsers(req.valid.query));
}

export async function get(req, res) {
  res.json({ data: await usersService.getUser(req.valid.params.id) });
}

export async function create(req, res) {
  res.status(201).json({ data: await usersService.createUser(req.user, req.valid.body) });
}

export async function update(req, res) {
  res.json({ data: await usersService.updateUser(req.user, req.valid.params.id, req.valid.body) });
}

export async function resetPassword(req, res) {
  await usersService.resetPassword(req.user, req.valid.params.id, req.valid.body.password);
  res.json({ message: 'Password berhasil diatur ulang' });
}

export async function remove(req, res) {
  await usersService.deleteUser(req.user, req.valid.params.id);
  res.json({ message: 'Akun berhasil dihapus' });
}
