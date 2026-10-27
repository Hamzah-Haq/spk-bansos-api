import * as periodeService from './periode.service.js';

export async function list(req, res) {
  res.json({ data: await periodeService.listPeriode(req.valid.query) });
}

export async function get(req, res) {
  res.json({ data: await periodeService.getPeriode(req.valid.params.id) });
}

export async function create(req, res) {
  res.status(201).json({ data: await periodeService.createPeriode(req.user, req.valid.body) });
}

export async function update(req, res) {
  res.json({ data: await periodeService.updatePeriode(req.user, req.valid.params.id, req.valid.body) });
}

export async function changeStatus(req, res) {
  const { id } = req.valid.params;
  res.json({ data: await periodeService.changeStatus(req.user, id, req.valid.body.status) });
}

export async function remove(req, res) {
  await periodeService.deletePeriode(req.user, req.valid.params.id);
  res.json({ message: 'Periode berhasil dihapus' });
}
