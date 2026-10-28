# spk-bansos-api

REST API for SPK Penerima Bansos (SAW method). Node 24 + Express 5 + Prisma 7 + PostgreSQL 17.
Plain JavaScript, ES modules (`"type": "module"`). Frontend lives in the separate `spk-bansos-web` repo.

> If a workspace-level `../../CLAUDE.md` exists, read it too: it has the domain summary
> (roles, criteria C1–C5, SAW formulas) and open decisions.

## Rules

- Never commit, push, pull, fetch, or change git remotes/config — the user handles git.
- Don't silently resolve the open decisions (C1 sifat, weights, answer-option scores); ask.

## Commands

```bash
cp .env.example .env            # first time
docker compose up -d db         # Postgres only (dev)
npm install                     # also runs `prisma generate` (postinstall)
npm run db:migrate              # apply/create migrations (prisma migrate dev)
npm run db:seed                 # idempotent fictional seed (accounts, RT, KK, kriteria, pertanyaan, periode)
npm run dev                     # http://localhost:3000, auto-restart on change
npm run db:studio               # browse data

docker compose up -d --build    # full stack demo: db + api + web → http://localhost:8080
```

Schema change: edit `prisma/schema.prisma` → `npm run db:migrate -- --name <what_changed>`.
Commit the generated folder under `prisma/migrations/`. Never edit an applied migration.

## Layout

```
prisma/schema.prisma      data model (Indonesian domain names, snake_case via @map/@@map)
prisma/seed.js            fictional seed data
prisma.config.js          Prisma 7 config (datasource url, migrations, seed command)
src/server.js             entry: listen + graceful shutdown
src/app.js                express app: middleware, routers under /api, error handler
src/config/env.js         the only place that reads process.env
src/lib/prisma.js         single PrismaClient (PrismaPg adapter) — import this one
src/lib/session.js        express-session + Postgres store (`session` table), promisified helpers,
                          revokeUserSessions(userId, exceptSid?) = log a user out everywhere
src/lib/audit.js          audit(db, { userId, aksi, entitas, entitasId, data }) + diff(before, after)
src/generated/prisma/     generated client (gitignored; `npm run db:generate`)
src/middlewares/          error handler (also maps Prisma P2002/P2003/P2025 and bad JSON);
                          auth.js = requireAuth / requireRole; validate.js = zod request validation
src/modules/<feature>/    feature code: <feature>.routes.js, .controller.js, .service.js
                          (auth, users, rt, periode, kk, kriteria, pertanyaan, survei, dashboard, health)
src/lib/uploads.js        photoUpload (multer, memory, 1 file ≤ 5 MB on field "file"), detectImage (JPEG/PNG/
                          WebP by magic bytes), saveUpload/removeUpload/uploadPath (refuses paths outside UPLOAD_DIR)
src/utils/http-error.js   HttpError(status, message, details)
src/utils/schemas.js      shared zod pieces: idParams, password, searchQuery, optionalQuery, pageQuery,
                          paginate(), pageMeta()
postman/                  Postman collection (import it; run with Collection Runner or newman)
```

## Auth & RBAC

- Session cookie `spk.sid` (httpOnly, SameSite=Lax, `secure: 'auto'`); the session holds only
  `userId`. `requireAuth` re-reads the user each request (deactivation/role change applies at
  once) and sets `req.user = { id, username, nama, role, rt }`. No session → 401.
- `requireRole('desa')` / `requireRole('rt')` after `requireAuth`; wrong role → 403. Put guards
  in the feature router (`router.use(requireAuth, requireRole('desa'))`) or per route.
- RT data scoping (an RT sees only KK in its own RT) is a service-layer filter on
  `req.user.rt.id`, not just a role check. Add it to every RT-facing query (see `scopedRtId` in
  `kk.service.js`). A record outside the RT's wilayah answers 404, not 403, so its existence
  isn't revealed; trying to create/move one into another RT answers 403.
- Self-lockout guard: a desa account can't deactivate, demote, delete or admin-reset itself, so
  at least one active desa account always remains.
- Password reset, password change, deactivation and deletion call `revokeUserSessions`.

## Endpoints

| Method & path | Role | Notes |
|---|---|---|
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | any | |
| `PUT /api/auth/password` | any | `{ currentPassword, newPassword }`; keeps current session, logs out others |
| `GET /api/users` | desa | `?q=&role=&rtId=&status=aktif\|nonaktif&page=&limit=` → `{ data, meta }` |
| `GET/POST /api/users`, `GET/PATCH/DELETE /api/users/:id` | desa | role rt requires `rtId`; delete only without survei/perhitungan history (else deactivate) |
| `PUT /api/users/:id/password` | desa | admin reset `{ password }` |
| `GET/POST /api/rt`, `GET/PATCH/DELETE /api/rt/:id` | desa | `noRt`/`noRw` padded to 3 digits; delete only with no accounts/KK |
| `GET /api/kk` | any | `?q=&rtId=&tanpaSurvei=<periodeId>&page=&limit=` → `{ data, meta }`; `q` matches No. KK, kepala keluarga, alamat; `tanpaSurvei` = only KK without a survei in that periode; RT always gets only its own RT (`rtId` ignored) |
| `POST /api/kk`, `GET/PATCH/DELETE /api/kk/:id` | any | `{ noKk (16 digit, unique), kepalaKeluarga, alamat, jumlahAnggota, rtId }`; `rtId` required for desa, RT uses its own; includes `jumlahSurvei`, `jumlahHasil`; delete only without survei/hasil |
| `GET /api/periode`, `GET /api/periode/:id` | any | `?status=`; includes `jumlahSurvei`, `jumlahPerhitungan` |
| `POST /api/periode`, `PATCH/DELETE /api/periode/:id` | desa | created as open; final is read-only; delete only without survei/perhitungan |
| `PATCH /api/periode/:id/status` | desa | `{ status }`: open → closed, closed → open \| final; at most one open periode |
| `GET /api/kriteria` | any | C1–C5 with `pertanyaan[].opsi[]` (and `jumlahJawaban`); `bobot` is a number; `meta = { totalBobot, kuesionerTerkunci }` (lock reason string or null) |
| `PATCH /api/kriteria/:id` | desa | `{ nama?, sifat? }`; no create/delete (C1–C5 fixed by proposal Tabel 2.1) |
| `PUT /api/kriteria/bobot` | desa | `{ bobot: [{ id, bobot }] }` for every kriteria; each > 0, ≤ 3 decimals, Σ = 1.000 exactly |
| `POST /api/pertanyaan`, `PATCH/DELETE /api/pertanyaan/:id` | desa | `{ kriteriaId, kode (1, 2a…; lowercase, unique), teks }`; PATCH `{ kode?, teks? }`; delete not the last one of a kriteria nor an answered one |
| `PUT /api/pertanyaan/:id/opsi` | desa | `{ opsi: [{ id?, label, skor 1–5 }] }`, 2–10, unique labels; replaces the list in that order (id = keep, no id = new, missing = delete unless answered) |

| `GET /api/survei` | any | `?periodeId=&status=&rtId=&q=&page=&limit=` → `{ data, meta }`; each with `kk`, `periode`, `jumlahJawaban`, `totalPertanyaan`, `jumlahFoto`, `dapatDiubah`; RT scoped through `kk.rtId` |
| `GET /api/dashboard` | any | current periode (open, else newest) + `kk { total, belumDisurvei }` + `survei { draft, submitted, verified, rejected, total }`, RT scoped; desa also gets `perRt[]`, `kuesioner { totalPertanyaan, belumBerOpsi[], totalBobot }`, `akunRtAktif` |
| `GET /api/survei/ringkasan` | any | `?periodeId=&rtId=` → `{ data: { draft, submitted, verified, rejected, total } }`; RT scoped |
| `GET /api/survei/:id` | any | plus `jawaban[] { pertanyaanId, opsiId, skor }`, `foto[]`; outside the RT's wilayah → 404 |
| `POST /api/survei/:id/verifikasi` | desa | `{ status: verified \| rejected, catatan? }`; only from submitted, periode not final; `catatan` required for rejected; sets `verifiedBy`/`verifiedAt` either way (= "diperiksa oleh") |
| `POST /api/survei` | rt | `{ kkId }` → draft in the open periode; 409 if no open periode, KK already surveyed in it, or kuesioner incomplete (a question with < 2 opsi) |
| `PUT /api/survei/:id/jawaban` | rt | `{ jawaban: [{ pertanyaanId, opsiId }] }` upserts only these (save per step); `skor` copied from the opsi |
| `POST /api/survei/:id/submit` | rt | draft/rejected → submitted; every question must be answered (409 lists the missing codes) |
| `DELETE /api/survei/:id` | rt | only a draft that was never submitted (also deletes its photos) |
| `POST /api/survei/:id/foto` | rt | multipart `file` + `jenis` (depan, lantai, dinding, atap, jamban, air); one per jenis, re-upload replaces |
| `GET /api/survei/:id/foto/:fotoId`, `DELETE …` | any / rt | GET streams the image with the survei's access rules; files in `UPLOAD_DIR/survei/<id>/` |

Survei edits (answers, photos, submit, delete) need status draft or rejected **and** an open periode
(`dapatDiubah`). Photos are not required for submit (not specified in the proposal).
Verification: submitted → verified (counts in SAW) or rejected (RT revises, resubmits; the old note
stays in `catatanVerifikasi` until the next decision). The update is conditional on
`status = 'submitted'` so two admins can't both decide. A decision can't be undone; a wrongly verified
survey has no reopen path yet. `GET /api/survei?status=submitted` sorts oldest submission first (queue).

Kuesioner lock: while any survei exists in a periode that is open/closed, adding/deleting questions
or options and changing scores answers 409 (two KK in one periode must be scored by the same rubric;
`jawaban.skor` is copied at answer time). Question text, codes and option labels stay editable.
Bobot and sifat stay editable; each SAW run snapshots them.

## Conventions

- All routes are mounted under `/api` (nginx and the Vite dev proxy forward that prefix only).
- Feature module pattern: routes (wiring + validation) → controller (req/res) → service (Prisma +
  business logic). Keep SAW math in a pure, DB-free module so it can be unit-tested.
- Throw `HttpError` for expected failures; Express 5 forwards async errors to `errorHandler`.
  Error JSON shape: `{ "error": { "message", "details?" } }`. User-facing messages in Indonesian.
  `details` is `{ field: message }` so the frontend can show it under the input.
- Validation: zod schemas in `<feature>.routes.js`, applied with
  `validate({ params, query, body })`. Controllers read the parsed values from
  `req.valid.{params,query,body}` (Express 5's `req.query` is read-only). Give field rules an
  Indonesian message; zod's `id` locale covers the rest.
- Responses: `{ data }` for one item or a small list (rt, periode); `{ data, meta }` with
  `meta = { page, limit, total, totalPages }` for lists that grow (users, later KK and survei).
  Mutations return the saved item; deletes return `{ message }`. Create = 201.
- Services check uniqueness and "still in use" first and throw a 409 with a specific message;
  the Prisma error mapping is only a safety net for races.
- Every create/update/delete writes `audit_log` in the same transaction (`aksi` like `user.create`,
  `periode.status`); `*.update` stores `diff(before, input)`. Never log password hashes.
- Prisma 7 specifics: the `prisma-client` generator emits TypeScript into `src/generated/prisma`;
  Node 24 imports it directly via type stripping (`../generated/prisma/client.ts`). Requires the
  `@prisma/adapter-pg` driver adapter. `.env` is loaded explicitly (`--env-file` for the app,
  `dotenv/config` in prisma.config.js and seed.js).
- Keep `prisma`, `@prisma/client`, `@prisma/adapter-pg` pinned to the same exact version.
- Uploaded photos go to `UPLOAD_DIR` (Docker volume `uploads`) and must be served only through an
  authenticated route, never `express.static`.
- Seed accounts (password from `SEED_PASSWORD`, default `password123`): `admin.desa` (desa),
  `rt001.rw001`, `rt002.rw001`, `rt003.rw001` (rt).
