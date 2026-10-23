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
npm run db:seed                 # idempotent fictional seed (accounts, RT, kriteria, pertanyaan, periode)
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
src/generated/prisma/     generated client (gitignored; `npm run db:generate`)
src/middlewares/          cross-cutting middleware (error handler; auth/role guards go here)
src/modules/<feature>/    feature code: <feature>.routes.js, .controller.js, .service.js
src/utils/http-error.js   HttpError(status, message, details)
```

## Conventions

- All routes are mounted under `/api` (nginx and the Vite dev proxy forward that prefix only).
- Feature module pattern: routes (wiring + validation) → controller (req/res) → service (Prisma +
  business logic). Keep SAW math in a pure, DB-free module so it can be unit-tested.
- Throw `HttpError` for expected failures; Express 5 forwards async errors to `errorHandler`.
  Error JSON shape: `{ "error": { "message", "details?" } }`. User-facing messages in Indonesian.
- Prisma 7 specifics: the `prisma-client` generator emits TypeScript into `src/generated/prisma`;
  Node 24 imports it directly via type stripping (`../generated/prisma/client.ts`). Requires the
  `@prisma/adapter-pg` driver adapter. `.env` is loaded explicitly (`--env-file` for the app,
  `dotenv/config` in prisma.config.js and seed.js).
- Keep `prisma`, `@prisma/client`, `@prisma/adapter-pg` pinned to the same exact version.
- Uploaded photos go to `UPLOAD_DIR` (Docker volume `uploads`) and must be served only through an
  authenticated route, never `express.static`.
- Seed accounts (password from `SEED_PASSWORD`, default `password123`): `admin.desa` (desa),
  `rt001.rw001`, `rt002.rw001`, `rt003.rw001` (rt).
