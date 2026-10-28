import * as kkService from './kk.service.js';

export async function list(req, res) {
  res.json(await kkService.listKk(req.user, req.valid.query));
}

export async function get(req, res) {
  res.json({ data: await kkService.getKk(req.user, req.valid.params.id) });
}

export async function create(req, res) {
  res.status(201).json({ data: await kkService.createKk(req.user, req.valid.body) });
}

export async function update(req, res) {
  res.json({ data: await kkService.updateKk(req.user, req.valid.params.id, req.valid.body) });
}

export async function remove(req, res) {
  await kkService.deleteKk(req.user, req.valid.params.id);
  res.json({ message: 'Data KK berhasil dihapus' });
}
