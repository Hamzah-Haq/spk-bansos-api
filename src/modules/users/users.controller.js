import * as usersService from './users.service.js';

export async function list(req, res) {
  res.json({ data: await usersService.listUsers() });
}
