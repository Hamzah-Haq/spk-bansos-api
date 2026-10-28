import * as perhitunganService from './perhitungan.service.js';

export async function list(req, res) {
  res.json({ data: await perhitunganService.listPerhitungan(req.valid.query) });
}

export async function get(req, res) {
  res.json({ data: await perhitunganService.getPerhitungan(req.valid.params.id) });
}

export async function run(req, res) {
  res.status(201).json({ data: await perhitunganService.runPerhitungan(req.user, req.valid.body) });
}
