-- migration_login_improvements.sql
-- Run ONCE in phpMyAdmin if you already ran setup.sql previously.
-- Safe to re-run — uses IF NOT EXISTS / MODIFY with NULL-safe defaults.

USE healthshare;

-- 1. First-login password change tracking
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_changed TINYINT DEFAULT 1 AFTER password_hash;

-- For staff accounts created by admins, set password_changed = 0
-- so they are forced to change on first login.
-- Patients self-register so they start at 1 (already chosen their own password).
UPDATE users SET password_changed = 0
  WHERE role IN ('doctor', 'hospital_admin', 'emergency')
    AND password_changed = 1
    AND created_at > '2024-01-01'; -- adjust if needed; safe to leave as-is

-- 2. Doctor phone for SMS OTP delivery
ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NULL AFTER full_name;

-- 3. Access request workflow columns (otp now nullable, adds reason/record_types/hospital_name/patient_approved)
ALTER TABLE otp_requests
  MODIFY COLUMN otp        VARCHAR(10)  NULL DEFAULT NULL,
  MODIFY COLUMN expires_at DATETIME     NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reason           TEXT         NULL         AFTER otp,
  ADD COLUMN IF NOT EXISTS record_types     VARCHAR(255) NULL         AFTER reason,
  ADD COLUMN IF NOT EXISTS hospital_name    VARCHAR(150) NULL         AFTER record_types,
  ADD COLUMN IF NOT EXISTS patient_approved TINYINT      DEFAULT 0   AFTER hospital_name;
