-- migration_clear_logs.sql
-- Run this ONCE in phpMyAdmin (select the healthshare database first) to
-- wipe out leftover demo/test audit log rows and stale OTP requests from
-- earlier testing, so notifications and pending-access screens start clean.
--
-- ALSO creates the new auth_tokens table required for the tab-isolated
-- login fix (lets a doctor tab and a patient tab be logged in at the same
-- time in one browser without kicking each other out).
--
-- Safe to run multiple times. Does NOT touch users, patients, doctors,
-- facilities, consents, or medical_records — only logs, OTP history, and
-- the new auth_tokens table.

USE healthshare;

DELETE FROM audit_logs;
DELETE FROM otp_requests;

CREATE TABLE IF NOT EXISTS auth_tokens (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  token        VARCHAR(64) UNIQUE NOT NULL,
  user_id      VARCHAR(20) NOT NULL,
  role         VARCHAR(30) NOT NULL,
  profile_json TEXT NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME NOT NULL,
  INDEX idx_token (token),
  INDEX idx_expiry (expires_at)
);
