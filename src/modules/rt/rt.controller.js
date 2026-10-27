import * as rtService from './rt.service.js';

export async function list(req, res) {
  res.json({ data: await rtService.listRt() });
}

export async function get(req, res) {
  res.json({ data: await rtService.getRt(req.valid.params.id) });
}

export async function create(req, res) {
  res.status(201).json({ data: await rtService.createRt(req.user, req.valid.body) });
}

export async function update(req, res) {
  res.json({ data: await rtService.updateRt(req.user, req.valid.params.id, req.valid.body) });
}

export async function remove(req, res) {
  await rtService.deleteRt(req.user, req.valid.params.id);
  res.json({ message: 'Wilayah RT berhasil dihapus' });
}
