import { HttpError } from '../utils/http-error.js';
import { env } from '../config/env.js';

export function notFound(req, res, next) {
  next(new HttpError(404, `Route ${req.method} ${req.originalUrl} tidak ditemukan`));
}

// Express 5 forwards rejected promises from async handlers here automatically.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err instanceof HttpError ? err.status : 500;

  if (status >= 500) console.error(err);

  res.status(status).json({
    error: {
      message: status >= 500 && env.isProduction ? 'Terjadi kesalahan pada server' : err.message,
      ...(err.details && { details: err.details }),
    },
  });
}
