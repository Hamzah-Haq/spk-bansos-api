import * as surveiService from './survei.service.js';

export async function list(req, res) {
  res.json(await surveiService.listSurvei(req.user, req.valid.query));
}

export async function get(req, res) {
  res.json({ data: await surveiService.getSurvei(req.user, req.valid.params.id) });
}

export async function create(req, res) {
  res.status(201).json({ data: await surveiService.createSurvei(req.user, req.valid.body) });
}

export async function saveJawaban(req, res) {
  const { id } = req.valid.params;
  res.json({ data: await surveiService.saveJawaban(req.user, id, req.valid.body.jawaban) });
}

export async function submit(req, res) {
  res.json({ data: await surveiService.submitSurvei(req.user, req.valid.params.id) });
}

export async function remove(req, res) {
  await surveiService.deleteSurvei(req.user, req.valid.params.id);
  res.json({ message: 'Survei berhasil dihapus' });
}

export async function uploadFoto(req, res) {
  const { id } = req.valid.params;
  res.status(201).json({ data: await surveiService.uploadFoto(req.user, id, req.valid.body.jenis, req.file) });
}

export async function fotoFile(req, res) {
  const { id, fotoId } = req.valid.params;
  const { absolutePath, mimeType } = await surveiService.getFotoFile(req.user, id, fotoId);

  // Photos of residents' homes: never cache in shared caches
  res.set('Cache-Control', 'private, max-age=300');
  res.type(mimeType);
  res.sendFile(absolutePath);
}

export async function removeFoto(req, res) {
  const { id, fotoId } = req.valid.params;
  await surveiService.deleteFoto(req.user, id, fotoId);
  res.json({ message: 'Foto berhasil dihapus' });
}
