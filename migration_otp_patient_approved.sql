-- migration_otp_patient_approved.sql
-- Run ONCE in phpMyAdmin (select the healthshare database first).
-- Adds patient_approved flag to otp_requests so patient approval and
-- doctor OTP verification are two separate steps (restores intended security flow).

USE healthshare;

ALTER TABLE otp_requests
  ADD COLUMN patient_approved TINYINT DEFAULT 0 AFTER used;
