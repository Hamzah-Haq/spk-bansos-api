import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http-error.js';

// Uploaded files live under UPLOAD_DIR (Docker volume `uploads`) and are only ever served through an
// authenticated route that checks access first — never express.static.
export const UPLOAD_ROOT = path.resolve(env.uploadDir);

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// Recognised by the file's first bytes, not the browser-supplied name or Content-Type
const IMAGE_TYPES = [
  {
    mime: 'image/jpeg',
    ext: 'jpg',
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    ext: 'png',
    matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    matches: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
];

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: `Ukuran foto maksimal ${MAX_PHOTO_BYTES / 1024 / 1024} MB`,
  LIMIT_FILE_COUNT: 'Unggah satu foto setiap kali',
  LIMIT_UNEXPECTED_FILE: 'Foto harus dikirim pada field "file"',
};

// No fileFilter: the type is checked from the bytes afterwards (an async fileFilter is also what
// GHSA-q7qp-rjg7-q26m was about). Memory storage is fine at 5 MB and one file per request.
const singlePhoto = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PHOTO_BYTES,
    files: 1,
    fields: 5,
  },
}).single('file');

// Route middleware: parses multipart/form-data into req.file (+ text fields in req.body).
export function photoUpload(req, res, next) {
  singlePhoto(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = MULTER_MESSAGES[err.code] ?? 'Unggahan foto tidak valid';
      return next(new HttpError(400, message, { file: message }));
    }
    if (err) return next(err);
    if (!req.file) {
      return next(new HttpError(400, 'Foto wajib dipilih', { file: 'Foto wajib dipilih' }));
    }
    next();
  });
}

// → { mime, ext } or throws 400 when the bytes are not JPEG/PNG/WebP
export function detectImage(buffer) {
  const type = buffer.length >= 12 && IMAGE_TYPES.find((t) => t.matches(buffer));
  if (!type) {
    const message = 'File harus berupa foto JPEG, PNG, atau WebP';
    throw new HttpError(400, message, { file: message });
  }
  return type;
}

// Absolute path of a stored file; refuses anything that would escape UPLOAD_ROOT.
export function uploadPath(relativePath) {
  const absolute = path.resolve(UPLOAD_ROOT, relativePath);
  if (!absolute.startsWith(UPLOAD_ROOT + path.sep)) {
    throw new Error(`Upload path escapes UPLOAD_DIR: ${relativePath}`);
  }
  return absolute;
}

// Writes `buffer` to <UPLOAD_DIR>/<dir>/<prefix>-<uuid>.<ext>; returns the path relative to UPLOAD_DIR
// (forward slashes, as stored in the database).
export async function saveUpload(dir, prefix, ext, buffer) {
  const relativePath = path.posix.join(dir, `${prefix}-${randomUUID()}.${ext}`);
  const absolute = uploadPath(relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, buffer, { flag: 'wx' });
  return relativePath;
}

// Best effort: a missing file is not an error (the row is what matters).
export async function removeUpload(relativePath) {
  try {
    await rm(uploadPath(relativePath), { force: true });
  } catch (err) {
    console.error(`Could not remove upload ${relativePath}:`, err);
  }
}

export async function removeUploadDir(dir) {
  try {
    await rm(uploadPath(dir), { recursive: true, force: true });
  } catch (err) {
    console.error(`Could not remove upload folder ${dir}:`, err);
  }
}
