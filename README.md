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

## Uji API dengan Postman
Import `postman/spk-bansos-api.postman_collection.json`, lalu jalankan lewat Collection Runner:
- **Skenario RBAC**: login, `/auth/me`, akses `/users` sebagai desa = 200 dan sebagai RT = 403, logout.
- **Skenario Master Data**: CRUD Wilayah RT, Akun, dan Periode (validasi 400, duplikat 409, akses
  RT = 403). Data uji dibuat lalu dihapus kembali, jadi aman dijalankan berulang.
- **Skenario Kartu Keluarga**: CRUD KK dan pembatasan wilayah untuk akun RT.
- **Skenario Kriteria & Kuesioner**: bobot (Σ = 1), nama/sifat kriteria, pertanyaan, dan opsi jawaban.
  Pertanyaan uji dibuat lalu dihapus dan bobot disimpan ulang dengan nilai asli. Hanya berjalan bila
  kuesioner tidak terkunci (belum ada survei pada periode yang belum final).
- **Skenario Survei**: mulai survei, simpan jawaban, validasi kirim, pembatasan wilayah RT, akses desa.
  Prasyarat: ada periode yang dibuka, setiap pertanyaan sudah memiliki minimal 2 opsi jawaban, dan RT 001
  masih punya KK yang belum disurvei. Draf uji dihapus di akhir; kirim berhasil dan unggah foto diuji manual.

Sesi memakai cookie httpOnly `spk.sid` yang otomatis disimpan Postman.
Tanpa Postman: `npx newman run postman/spk-bansos-api.postman_collection.json`.

## Menjalankan seluruh sistem (demo)
Pastikan repo frontend `spk-bansos-web` ada di `../../Frontend/spk-bansos-web` (atau atur `WEB_PATH` di `.env`), lalu:
```bash
docker compose up -d --build   # http://localhost:8080
```
Untuk mengisi data fiktif di container: `docker compose exec api npm run db:seed`.
