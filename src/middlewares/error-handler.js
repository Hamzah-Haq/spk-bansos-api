import { HttpError } from '../utils/http-error.js';
import { env } from '../config/env.js';

export function notFound(req, res, next) {
  next(new HttpError(404, `Route ${req.method} ${req.originalUrl} tidak ditemukan`));
}

// Safety net for races the services don't pre-check (e.g. two requests creating the same username
// at once). Services should still check first and throw an HttpError with a specific message.
const PRISMA_ERRORS = {
  P2002: [409, 'Data sudah terdaftar'],
  P2003: [409, 'Data masih digunakan oleh data lain'],
  P2025: [404, 'Data tidak ditemukan'],
};

function toHttpError(err) {
  if (err instanceof HttpError) return err;

  const prismaError = PRISMA_ERRORS[err.code];
  if (prismaError) return new HttpError(...prismaError);

  // body-parser errors (malformed JSON, payload too large) carry a 4xx status and expose = true
  if (err.expose && err.status < 500) {
    const message = err.type === 'entity.parse.failed' ? 'Format JSON tidak valid' : err.message;
    return new HttpError(err.status, message);
  }
  return null;
}

// Express 5 forwards rejected promises from async handlers here automatically.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const httpError = toHttpError(err);
  const status = httpError?.status ?? 500;

  if (status >= 500) console.error(err);

  res.status(status).json({
    error: {
      message: status >= 500 && env.isProduction ? 'Terjadi kesalahan pada server' : (httpError ?? err).message,
      ...(httpError?.details && { details: httpError.details }),
    },
  });
}
