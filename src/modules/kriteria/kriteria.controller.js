import * as kriteriaService from './kriteria.service.js';

export async function list(req, res) {
  res.json(await kriteriaService.listKriteria());
}

export async function update(req, res) {
  res.json({ data: await kriteriaService.updateKriteria(req.user, req.valid.params.id, req.valid.body) });
}

export async function updateBobot(req, res) {
  res.json(await kriteriaService.updateBobot(req.user, req.valid.body.bobot));
}
