import { z } from 'zod';

// Shared zod pieces for routes. Feature-specific schemas live in each <feature>.routes.js.

export const idParams = z.object({
  id: z.coerce.number().int().positive('ID tidak valid'),
});

// Query-string values: "" (an empty select/search box) counts as "not set".
function emptyAsUnset(schema) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema);
}

export function optionalQuery(schema) {
  return emptyAsUnset(schema.optional());
}

// New passwords (admin reset and self-service change). bcrypt only uses the first 72 bytes.
export const password = z
  .string({ error: 'Password wajib diisi' })
  .min(8, 'Password minimal 8 karakter')
  .max(72, 'Password maksimal 72 karakter');

export const searchQuery = optionalQuery(z.string().trim().max(100, 'Kata kunci maksimal 100 karakter'));

// List convention for collections that can grow: ?page=1&limit=20 → { data, meta }.
export const pageQuery = {
  page: emptyAsUnset(z.coerce.number().int().min(1).default(1)),
  limit: emptyAsUnset(z.coerce.number().int().min(1).max(100).default(20)),
};

export function paginate({ page, limit }) {
  return { skip: (page - 1) * limit, take: limit };
}

export function pageMeta({ page, limit }, total) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
