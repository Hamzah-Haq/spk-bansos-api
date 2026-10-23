# spk-bansos-api
REST API Sistem Pendukung Keputusan Penerima Bansos menggunakan metode Simple Additive Weighting (SAW). Dibangun dengan Express.js dan PostgreSQL.

## Prasyarat
- Node.js 24 LTS
- Docker Desktop

## Menjalankan (development)
```bash
cp .env.example .env
docker compose up -d db     # PostgreSQL
npm install
npm run db:migrate          # buat tabel
npm run db:seed             # data fiktif
npm run dev                 # http://localhost:3000/api/health
```

Akun seed (password `password123`): `admin.desa`, `rt001.rw001`, `rt002.rw001`, `rt003.rw001`.

## Menjalankan seluruh sistem (demo)
Pastikan repo frontend `spk-bansos-web` ada di `../../Frontend/spk-bansos-web` (atau atur `WEB_PATH` di `.env`), lalu:
```bash
docker compose up -d --build   # http://localhost:8080
```
Untuk mengisi data fiktif di container: `docker compose exec api npm run db:seed`.
