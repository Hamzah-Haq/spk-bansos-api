import { z } from 'zod';
import { HttpError } from '../utils/http-error.js';

// Fallback messages in Indonesian for rules without a custom message.
z.config(z.locales.id());

// Parses request parts with zod schemas and exposes the result as req.valid = { params, query, body }
// (coerced + defaults applied). Express 5's req.query is read-only, so nothing is overwritten.
//   router.post('/', validate({ body: createSchema }), controller.create)
// Failure → 400 with details = { field: message }, the same shape the login form already reads.
export function validate(schemas) {
  return (req, res, next) => {
    const valid = {};
    const details = {};

    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;

      const result = schemas[part].safeParse(req[part] ?? {});
      if (result.success) {
        valid[part] = result.data;
        continue;
      }
      for (const issue of result.error.issues) {
        details[issue.path.join('.') || part] ??= issue.message;
      }
    }

    if (Object.keys(details).length) {
      throw new HttpError(400, 'Data yang dikirim tidak valid', details);
    }
    req.valid = valid;
    next();
  };
}
