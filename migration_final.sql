-- migration_final.sql
-- Run ONCE in phpMyAdmin (select healthshare database first).
-- Safe to re-run — all statements use IF NOT EXISTS / MODIFY.
-- Implements: structured contact fields, phone/email uniqueness, new columns.

USE healthshare;

-- ── 1. Structured next-of-kin columns ─────────────────────────────────────
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS next_of_kin_name         VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS next_of_kin_relationship VARCHAR(50)  NULL;

-- ── 2. Structured emergency contact columns ────────────────────────────────
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS emergency_contact_name         VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(50)  NULL,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone        VARCHAR(20)  NULL;

-- ── 3. Password change tracking (for first-login forced change) ────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_changed TINYINT DEFAULT 1 AFTER password_hash;

-- ── 4. Patient primary hospital ────────────────────────────────────────────
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS facility_id VARCHAR(20) NULL AFTER phone;

-- ── 5. Doctor phone (for future SMS delivery) ──────────────────────────────
ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NULL AFTER full_name;

-- ── 6. OTP workflow columns (nullable otp/expires_at, reason, record_types) ─
ALTER TABLE otp_requests
  MODIFY COLUMN otp        VARCHAR(10)  NULL DEFAULT NULL,
  MODIFY COLUMN expires_at DATETIME     NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reason           TEXT         NULL AFTER otp,
  ADD COLUMN IF NOT EXISTS record_types     VARCHAR(255) NULL AFTER reason,
  ADD COLUMN IF NOT EXISTS hospital_name    VARCHAR(150) NULL AFTER record_types,
  ADD COLUMN IF NOT EXISTS patient_approved TINYINT      DEFAULT 0 AFTER hospital_name;

-- ── 7. Phone uniqueness index (non-enforced UNIQUE — allows NULL) ──────────
-- We handle uniqueness in PHP to give meaningful error messages.
-- Adding an index improves lookup performance for phone-based login.
ALTER TABLE patients ADD INDEX IF NOT EXISTS idx_phone (phone);
ALTER TABLE patients ADD INDEX IF NOT EXISTS idx_national_id (national_id);
ALTER TABLE patients ADD INDEX IF NOT EXISTS idx_email (email);
