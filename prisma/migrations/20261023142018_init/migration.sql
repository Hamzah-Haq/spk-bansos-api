-- CreateEnum
CREATE TYPE "Role" AS ENUM ('rt', 'desa');

-- CreateEnum
CREATE TYPE "SifatKriteria" AS ENUM ('benefit', 'cost');

-- CreateEnum
CREATE TYPE "StatusPeriode" AS ENUM ('open', 'closed', 'final');

-- CreateEnum
CREATE TYPE "StatusSurvei" AS ENUM ('draft', 'submitted', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "JenisFoto" AS ENUM ('depan', 'lantai', 'dinding', 'atap', 'jamban', 'air');

-- CreateTable
CREATE TABLE "rt" (
    "id" SERIAL NOT NULL,
    "no_rt" VARCHAR(3) NOT NULL,
    "no_rw" VARCHAR(3) NOT NULL,

    CONSTRAINT "rt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nama" VARCHAR(100) NOT NULL,
    "role" "Role" NOT NULL,
    "rt_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kartu_keluarga" (
    "id" SERIAL NOT NULL,
    "no_kk" CHAR(16) NOT NULL,
    "kepala_keluarga" VARCHAR(100) NOT NULL,
    "alamat" TEXT NOT NULL,
    "jumlah_anggota" INTEGER NOT NULL,
    "rt_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kartu_keluarga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periode" (
    "id" SERIAL NOT NULL,
    "nama" VARCHAR(100) NOT NULL,
    "tahun" INTEGER NOT NULL,
    "kuota" INTEGER NOT NULL,
    "status" "StatusPeriode" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "periode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kriteria" (
    "id" SERIAL NOT NULL,
    "kode" VARCHAR(5) NOT NULL,
    "nama" VARCHAR(100) NOT NULL,
    "sifat" "SifatKriteria" NOT NULL,
    "bobot" DECIMAL(4,3) NOT NULL,

    CONSTRAINT "kriteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pertanyaan" (
    "id" SERIAL NOT NULL,
    "kriteria_id" INTEGER NOT NULL,
    "kode" VARCHAR(5) NOT NULL,
    "teks" TEXT NOT NULL,
    "urutan" INTEGER NOT NULL,

    CONSTRAINT "pertanyaan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opsi_jawaban" (
    "id" SERIAL NOT NULL,
    "pertanyaan_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "skor" SMALLINT NOT NULL,
    "urutan" INTEGER NOT NULL,

    CONSTRAINT "opsi_jawaban_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survei" (
    "id" SERIAL NOT NULL,
    "kk_id" INTEGER NOT NULL,
    "periode_id" INTEGER NOT NULL,
    "surveyor_id" INTEGER NOT NULL,
    "status" "StatusSurvei" NOT NULL DEFAULT 'draft',
    "catatan_verifikasi" TEXT,
    "verified_by_id" INTEGER,
    "submitted_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "survei_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jawaban" (
    "survei_id" INTEGER NOT NULL,
    "pertanyaan_id" INTEGER NOT NULL,
    "opsi_id" INTEGER NOT NULL,
    "skor" SMALLINT NOT NULL,

    CONSTRAINT "jawaban_pkey" PRIMARY KEY ("survei_id","pertanyaan_id")
);

-- CreateTable
CREATE TABLE "foto_survei" (
    "id" SERIAL NOT NULL,
    "survei_id" INTEGER NOT NULL,
    "jenis" "JenisFoto" NOT NULL,
    "path" TEXT NOT NULL,
    "mime_type" VARCHAR(50) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "foto_survei_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perhitungan" (
    "id" SERIAL NOT NULL,
    "periode_id" INTEGER NOT NULL,
    "executed_by_id" INTEGER NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bobot_snapshot" JSONB NOT NULL,
    "minmax_snapshot" JSONB NOT NULL,

    CONSTRAINT "perhitungan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hasil_perhitungan" (
    "id" SERIAL NOT NULL,
    "perhitungan_id" INTEGER NOT NULL,
    "kk_id" INTEGER NOT NULL,
    "nilai" JSONB NOT NULL,
    "normalisasi" JSONB NOT NULL,
    "nilai_v" DECIMAL(6,4) NOT NULL,
    "ranking" INTEGER NOT NULL,
    "layak" BOOLEAN NOT NULL,

    CONSTRAINT "hasil_perhitungan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "aksi" VARCHAR(50) NOT NULL,
    "entitas" VARCHAR(50) NOT NULL,
    "entitas_id" VARCHAR(50),
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rt_no_rt_no_rw_key" ON "rt"("no_rt", "no_rw");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "kartu_keluarga_no_kk_key" ON "kartu_keluarga"("no_kk");

-- CreateIndex
CREATE INDEX "kartu_keluarga_rt_id_idx" ON "kartu_keluarga"("rt_id");

-- CreateIndex
CREATE UNIQUE INDEX "kriteria_kode_key" ON "kriteria"("kode");

-- CreateIndex
CREATE UNIQUE INDEX "pertanyaan_kode_key" ON "pertanyaan"("kode");

-- CreateIndex
CREATE INDEX "survei_periode_id_status_idx" ON "survei"("periode_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "survei_kk_id_periode_id_key" ON "survei"("kk_id", "periode_id");

-- CreateIndex
CREATE UNIQUE INDEX "hasil_perhitungan_perhitungan_id_kk_id_key" ON "hasil_perhitungan"("perhitungan_id", "kk_id");

-- CreateIndex
CREATE INDEX "audit_log_entitas_entitas_id_idx" ON "audit_log"("entitas", "entitas_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_rt_id_fkey" FOREIGN KEY ("rt_id") REFERENCES "rt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kartu_keluarga" ADD CONSTRAINT "kartu_keluarga_rt_id_fkey" FOREIGN KEY ("rt_id") REFERENCES "rt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pertanyaan" ADD CONSTRAINT "pertanyaan_kriteria_id_fkey" FOREIGN KEY ("kriteria_id") REFERENCES "kriteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opsi_jawaban" ADD CONSTRAINT "opsi_jawaban_pertanyaan_id_fkey" FOREIGN KEY ("pertanyaan_id") REFERENCES "pertanyaan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survei" ADD CONSTRAINT "survei_kk_id_fkey" FOREIGN KEY ("kk_id") REFERENCES "kartu_keluarga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survei" ADD CONSTRAINT "survei_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "periode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survei" ADD CONSTRAINT "survei_surveyor_id_fkey" FOREIGN KEY ("surveyor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survei" ADD CONSTRAINT "survei_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jawaban" ADD CONSTRAINT "jawaban_survei_id_fkey" FOREIGN KEY ("survei_id") REFERENCES "survei"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jawaban" ADD CONSTRAINT "jawaban_pertanyaan_id_fkey" FOREIGN KEY ("pertanyaan_id") REFERENCES "pertanyaan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jawaban" ADD CONSTRAINT "jawaban_opsi_id_fkey" FOREIGN KEY ("opsi_id") REFERENCES "opsi_jawaban"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foto_survei" ADD CONSTRAINT "foto_survei_survei_id_fkey" FOREIGN KEY ("survei_id") REFERENCES "survei"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perhitungan" ADD CONSTRAINT "perhitungan_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "periode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perhitungan" ADD CONSTRAINT "perhitungan_executed_by_id_fkey" FOREIGN KEY ("executed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hasil_perhitungan" ADD CONSTRAINT "hasil_perhitungan_perhitungan_id_fkey" FOREIGN KEY ("perhitungan_id") REFERENCES "perhitungan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hasil_perhitungan" ADD CONSTRAINT "hasil_perhitungan_kk_id_fkey" FOREIGN KEY ("kk_id") REFERENCES "kartu_keluarga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
