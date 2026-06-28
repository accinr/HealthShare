-- migration_admin_patient_registration.sql
-- Run ONCE in phpMyAdmin (select healthshare database first).
-- Adds demographic fields required for admin-registered patients.
-- Safe to re-run — uses ADD COLUMN IF NOT EXISTS.

USE healthshare;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS email             VARCHAR(150) NULL          AFTER phone,
  ADD COLUMN IF NOT EXISTS date_of_birth     DATE         NULL          AFTER email,
  ADD COLUMN IF NOT EXISTS gender            VARCHAR(20)  NULL          AFTER date_of_birth,
  ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(150) NULL          AFTER gender,
  ADD COLUMN IF NOT EXISTS next_of_kin       VARCHAR(150) NULL          AFTER emergency_contact;

-- Patients registered by admins start with password_changed = 0
-- (forced to change on first login). Existing self-registered patients
-- keep password_changed = 1 (they already chose their own password).
-- No UPDATE needed here — register_patient.php now sets 0 explicitly.
