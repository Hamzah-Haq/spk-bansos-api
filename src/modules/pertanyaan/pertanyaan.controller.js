import * as pertanyaanService from './pertanyaan.service.js';

export async function create(req, res) {
  res.status(201).json({ data: await pertanyaanService.createPertanyaan(req.user, req.valid.body) });
}

export async function update(req, res) {
  const { id } = req.valid.params;
  res.json({ data: await pertanyaanService.updatePertanyaan(req.user, id, req.valid.body) });
}

export async function remove(req, res) {
  await pertanyaanService.deletePertanyaan(req.user, req.valid.params.id);
  res.json({ message: 'Pertanyaan berhasil dihapus' });
}

export async function replaceOpsi(req, res) {
  const { id } = req.valid.params;
  res.json({ data: await pertanyaanService.replaceOpsi(req.user, id, req.valid.body.opsi) });
}
