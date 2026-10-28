import { access } from 'node:fs/promises';
import { prisma } from '../../lib/prisma.js';
import { audit } from '../../lib/audit.js';
import { detectImage, removeUpload, removeUploadDir, saveUpload, uploadPath } from '../../lib/uploads.js';
import { HttpError } from '../../utils/http-error.js';
import { paginate, pageMeta } from '../../utils/schemas.js';
import { scopedRtId } from '../kk/kk.service.js';
import { kelengkapanKuesioner } from '../pertanyaan/pertanyaan.service.js';

// draft → submitted → verified | rejected → (RT revises) → submitted → ...
const EDITABLE_STATUS = ['draft', 'rejected'];

const STATUS_LABELS = {
  draft: 'draf',
  submitted: 'menunggu verifikasi',
  verified: 'terverifikasi',
  rejected: 'perlu revisi',
};

const surveiSelect = {
  id: true,
  status: true,
  catatanVerifikasi: true,
  submittedAt: true,
  verifiedAt: true,
  createdAt: true,
  updatedAt: true,
  kk: {
    select: {
      id: true,
      noKk: true,
      kepalaKeluarga: true,
      alamat: true,
      jumlahAnggota: true,
      rt: { select: { id: true, noRt: true, noRw: true } },
    },
  },
  periode: { select: { id: true, nama: true, tahun: true, status: true } },
  surveyor: { select: { id: true, nama: true } },
  verifiedBy: { select: { id: true, nama: true } },
  _count: { select: { jawaban: true, foto: true } },
};

const detailSelect = {
  ...surveiSelect,
  jawaban: { select: { pertanyaanId: true, opsiId: true, skor: true } },
  foto: {
    select: {
      id: true,
      jenis: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
    },
    orderBy: { id: 'asc' },
  },
};

function toPublicSurvei({ _count, ...survei }, totalPertanyaan) {
  return {
    ...survei,
    jumlahJawaban: _count.jawaban,
    jumlahFoto: _count.foto,
    totalPertanyaan,
    // Editable by the RT right now (status and periode both allow it)
    dapatDiubah: EDITABLE_STATUS.includes(survei.status) && survei.periode.status === 'open',
  };
}

// A survei is visible to an RT account only through a KK in its own RT.
function scopedWhere(actor, id) {
  const rtId = scopedRtId(actor);
  return { id, ...(rtId && { kk: { rtId } }) };
}

export async function listSurvei(actor, { periodeId, status, rtId, q, page, limit }) {
  const where = {
    periodeId,
    status,
    kk: {
      rtId: scopedRtId(actor) ?? rtId,
      ...(q && {
        OR: [
          { noKk: { contains: q } },
          { kepalaKeluarga: { contains: q, mode: 'insensitive' } },
        ],
      }),
    },
  };

  // The verification queue is first come, first served; other lists show recent activity first
  const orderBy =
    status === 'submitted'
      ? [{ submittedAt: 'asc' }, { id: 'asc' }]
      : [{ updatedAt: 'desc' }, { id: 'desc' }];

  const [rows, total, totalPertanyaan] = await prisma.$transaction([
    prisma.survei.findMany({
      where,
      select: surveiSelect,
      orderBy,
      ...paginate({ page, limit }),
    }),
    prisma.survei.count({ where }),
    prisma.pertanyaan.count(),
  ]);
  return {
    data: rows.map((row) => toPublicSurvei(row, totalPertanyaan)),
    meta: pageMeta({ page, limit }, total),
  };
}

// Survey counts per status in a periode (verification tabs, dashboard); RT accounts: own RT only.
export async function ringkasanSurvei(actor, { periodeId, rtId }) {
  const groups = await prisma.survei.groupBy({
    by: ['status'],
    where: { periodeId, kk: { rtId: scopedRtId(actor) ?? rtId } },
    _count: { _all: true },
  });
  const counts = {
    draft: 0,
    submitted: 0,
    verified: 0,
    rejected: 0,
  };
  for (const group of groups) counts[group.status] = group._count._all;
  return { ...counts, total: groups.reduce((sum, g) => sum + g._count._all, 0) };
}

// Outside the RT account's wilayah → 404, so the survey's existence isn't revealed.
export async function getSurvei(actor, id) {
  const [survei, totalPertanyaan] = await Promise.all([
    prisma.survei.findFirst({ where: scopedWhere(actor, id), select: detailSelect }),
    prisma.pertanyaan.count(),
  ]);
  if (!survei) throw new HttpError(404, 'Survei tidak ditemukan');
  return toPublicSurvei(survei, totalPertanyaan);
}

// For RT mutations: the survei must be in its wilayah, still editable and in an open periode.
async function getEditable(actor, id) {
  const survei = await getSurvei(actor, id);
  if (!EDITABLE_STATUS.includes(survei.status)) {
    throw new HttpError(409, `Survei sudah ${STATUS_LABELS[survei.status]} sehingga tidak dapat diubah`);
  }
  if (survei.periode.status !== 'open') {
    throw new HttpError(409, `Periode "${survei.periode.nama}" sudah ditutup sehingga survei tidak dapat diubah`);
  }
  return survei;
}

// Every question needs options before anyone can answer it. Checked before the first survey of a
// periode exists, because that survey locks the questionnaire (see kuesionerLockReason).
async function assertKuesionerLengkap() {
  const { totalPertanyaan, belumBerOpsi: belum } = await kelengkapanKuesioner();
  if (!totalPertanyaan || belum.length) {
    throw new HttpError(
      409,
      `Kuesioner belum lengkap${belum.length ? `: pertanyaan ${belum.join(', ')} belum memiliki opsi jawaban` : ''}. ` +
        'Hubungi admin desa.',
    );
  }
}

export async function createSurvei(actor, { kkId }) {
  const periode = await prisma.periode.findFirst({ where: { status: 'open' }, select: { id: true, nama: true } });
  if (!periode) {
    throw new HttpError(409, 'Belum ada periode yang dibuka. Survei hanya dapat dibuat pada periode yang dibuka.');
  }

  const kk = await prisma.kartuKeluarga.findFirst({
    where: { id: kkId, rtId: scopedRtId(actor) },
    select: { id: true, noKk: true, kepalaKeluarga: true },
  });
  if (!kk) {
    throw new HttpError(400, 'Data yang dikirim tidak valid', { kkId: 'Data KK tidak ditemukan' });
  }

  // Unique Restriction: one survei (and therefore at most one aid) per KK per periode
  const existing = await prisma.survei.findUnique({
    where: { kkId_periodeId: { kkId, periodeId: periode.id } },
    select: { id: true },
  });
  if (existing) {
    const message = `KK ${kk.kepalaKeluarga} sudah disurvei pada periode "${periode.nama}"`;
    throw new HttpError(409, message, { kkId: message });
  }

  await assertKuesionerLengkap();

  const survei = await prisma.$transaction(async (tx) => {
    const created = await tx.survei.create({
      data: {
        kkId,
        periodeId: periode.id,
        surveyorId: actor.id,
      },
      select: { id: true },
    });
    await audit(tx, {
      userId: actor.id,
      aksi: 'survei.create',
      entitas: 'survei',
      entitasId: created.id,
      data: { kkId, noKk: kk.noKk, periodeId: periode.id },
    });
    return created;
  });
  return getSurvei(actor, survei.id);
}

// Saves (inserts or replaces) the given answers; others stay as they are, so the form can save
// one step at a time. The option's skor is copied into jawaban so later rubric edits don't
// rewrite this survey.
export async function saveJawaban(actor, id, items) {
  const survei = await getEditable(actor, id);

  const opsi = await prisma.opsiJawaban.findMany({
    where: { id: { in: items.map((item) => item.opsiId) } },
    select: {
      id: true,
      skor: true,
      pertanyaanId: true,
      pertanyaan: { select: { kode: true } },
    },
  });
  const opsiById = new Map(opsi.map((o) => [o.id, o]));

  const details = {};
  items.forEach((item, index) => {
    if (opsiById.get(item.opsiId)?.pertanyaanId !== item.pertanyaanId) {
      details[`jawaban.${index}.opsiId`] = 'Opsi jawaban tidak sesuai dengan pertanyaan';
    }
  });
  if (Object.keys(details).length) throw new HttpError(400, 'Data yang dikirim tidak valid', details);

  const before = new Map(survei.jawaban.map((j) => [j.pertanyaanId, j]));
  const changed = items.filter((item) => before.get(item.pertanyaanId)?.opsiId !== item.opsiId);
  if (!changed.length) return survei;

  await prisma.$transaction([
    ...changed.map((item) => {
      const data = { opsiId: item.opsiId, skor: opsiById.get(item.opsiId).skor };
      return prisma.jawaban.upsert({
        where: { surveiId_pertanyaanId: { surveiId: id, pertanyaanId: item.pertanyaanId } },
        create: { surveiId: id, pertanyaanId: item.pertanyaanId, ...data },
        update: data,
      });
    }),
    prisma.survei.update({ where: { id }, data: { updatedAt: new Date() } }),
    // Answer history matters when residents question a result
    audit(prisma, {
      userId: actor.id,
      aksi: 'survei.jawaban',
      entitas: 'survei',
      entitasId: id,
      data: Object.fromEntries(
        changed.map((item) => {
          const opsiBaru = opsiById.get(item.opsiId);
          return [opsiBaru.pertanyaan.kode, { dari: before.get(item.pertanyaanId)?.skor ?? null, ke: opsiBaru.skor }];
        }),
      ),
    }),
  ]);
  return getSurvei(actor, id);
}

export async function submitSurvei(actor, id) {
  const survei = await getEditable(actor, id);

  const pertanyaan = await prisma.pertanyaan.findMany({
    select: { id: true, kode: true },
    orderBy: [{ kriteriaId: 'asc' }, { urutan: 'asc' }],
  });
  const answered = new Set(survei.jawaban.map((j) => j.pertanyaanId));
  const missing = pertanyaan.filter((p) => !answered.has(p.id)).map((p) => p.kode);
  if (missing.length) {
    const message = `Masih ada pertanyaan yang belum dijawab: ${missing.join(', ')}`;
    throw new HttpError(409, message, { jawaban: message });
  }

  await prisma.$transaction([
    prisma.survei.update({
      where: { id },
      data: { status: 'submitted', submittedAt: new Date() },
    }),
    audit(prisma, {
      userId: actor.id,
      aksi: 'survei.submit',
      entitas: 'survei',
      entitasId: id,
      data: { dari: survei.status },
    }),
  ]);
  return getSurvei(actor, id);
}

// Perangkat Desa's decision on a submitted survey: verified (counts in SAW) or rejected (back to the
// RT with a note, who revises and submits again). verifiedBy/verifiedAt record who decided either way.
export async function verifySurvei(actor, id, { status, catatan }) {
  const survei = await getSurvei(actor, id);
  if (survei.status !== 'submitted') {
    throw new HttpError(
      409,
      `Survei berstatus ${STATUS_LABELS[survei.status]}; hanya survei yang menunggu verifikasi yang dapat diperiksa`,
    );
  }
  if (survei.periode.status === 'final') {
    throw new HttpError(409, `Periode "${survei.periode.nama}" sudah final sehingga survei tidak dapat diperiksa lagi`);
  }
  if (status === 'rejected' && !catatan) {
    const message = 'Catatan wajib diisi agar Ketua RT tahu apa yang harus diperbaiki';
    throw new HttpError(400, message, { catatan: message });
  }

  await prisma.$transaction(async (tx) => {
    // Conditional on the status, so two admins deciding at once can't both win
    const { count } = await tx.survei.updateMany({
      where: { id, status: 'submitted' },
      data: {
        status,
        catatanVerifikasi: catatan || null,
        verifiedById: actor.id,
        verifiedAt: new Date(),
      },
    });
    if (!count) throw new HttpError(409, 'Survei baru saja diperiksa oleh pengguna lain. Muat ulang halaman.');

    await audit(tx, {
      userId: actor.id,
      aksi: status === 'verified' ? 'survei.verify' : 'survei.reject',
      entitas: 'survei',
      entitasId: id,
      data: { catatan: catatan || null },
    });
  });
  return getSurvei(actor, id);
}

// A survey created by mistake can be discarded until it is first submitted. After that it is part
// of the verification history and stays.
export async function deleteSurvei(actor, id) {
  const survei = await getEditable(actor, id);
  if (survei.status !== 'draft' || survei.submittedAt) {
    throw new HttpError(409, 'Survei yang sudah pernah dikirim tidak dapat dihapus');
  }

  await prisma.$transaction([
    prisma.survei.delete({ where: { id } }),
    audit(prisma, {
      userId: actor.id,
      aksi: 'survei.delete',
      entitas: 'survei',
      entitasId: id,
      data: { kkId: survei.kk.id, noKk: survei.kk.noKk, periodeId: survei.periode.id },
    }),
  ]);
  await removeUploadDir(fotoDir(id));
}

function fotoDir(surveiId) {
  return `survei/${surveiId}`;
}

// One photo per jenis: uploading again replaces the previous one.
export async function uploadFoto(actor, id, jenis, file) {
  const survei = await getEditable(actor, id);
  const { mime, ext } = detectImage(file.buffer);
  const previous = survei.foto.find((f) => f.jenis === jenis);

  const path = await saveUpload(fotoDir(id), jenis, ext, file.buffer);
  try {
    const foto = await prisma.$transaction(async (tx) => {
      let old = null;
      if (previous) {
        old = await tx.fotoSurvei.delete({ where: { id: previous.id }, select: { path: true } });
      }
      const created = await tx.fotoSurvei.create({
        data: {
          surveiId: id,
          jenis,
          path,
          mimeType: mime,
          sizeBytes: file.size,
        },
        select: {
          id: true,
          jenis: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
        },
      });
      await tx.survei.update({ where: { id }, data: { updatedAt: new Date() } });
      await audit(tx, {
        userId: actor.id,
        aksi: previous ? 'survei.foto_ganti' : 'survei.foto',
        entitas: 'survei',
        entitasId: id,
        data: { jenis, fotoId: created.id, sizeBytes: file.size },
      });
      return { created, oldPath: old?.path };
    });
    if (foto.oldPath) await removeUpload(foto.oldPath);
    return foto.created;
  } catch (err) {
    await removeUpload(path);
    throw err;
  }
}

async function getFoto(actor, id, fotoId) {
  const foto = await prisma.fotoSurvei.findFirst({
    where: { id: fotoId, survei: scopedWhere(actor, id) },
    select: { id: true, jenis: true, path: true, mimeType: true },
  });
  if (!foto) throw new HttpError(404, 'Foto tidak ditemukan');
  return foto;
}

export async function getFotoFile(actor, id, fotoId) {
  const foto = await getFoto(actor, id, fotoId);
  const absolutePath = uploadPath(foto.path);
  try {
    await access(absolutePath);
  } catch {
    throw new HttpError(404, 'File foto tidak ditemukan di server');
  }
  return { absolutePath, mimeType: foto.mimeType };
}

export async function deleteFoto(actor, id, fotoId) {
  await getEditable(actor, id);
  const foto = await getFoto(actor, id, fotoId);

  await prisma.$transaction([
    prisma.fotoSurvei.delete({ where: { id: fotoId } }),
    prisma.survei.update({ where: { id }, data: { updatedAt: new Date() } }),
    audit(prisma, {
      userId: actor.id,
      aksi: 'survei.foto_hapus',
      entitas: 'survei',
      entitasId: id,
      data: { jenis: foto.jenis, fotoId },
    }),
  ]);
  await removeUpload(foto.path);
}
