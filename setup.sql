-- HealthShare Database Setup
-- Run once in phpMyAdmin or MySQL CLI: source setup.sql

CREATE DATABASE IF NOT EXISTS healthshare CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE healthshare;

-- ─────────────────────────────────────────────────────────────
--  CORE AUTH TABLE  (every actor has one row here)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      VARCHAR(20)  UNIQUE NOT NULL,   -- KE-HID-XXXXX / KE-STF-XXXXX / etc.
  role         ENUM('patient','doctor','hospital_admin','system_admin','emergency') NOT NULL,
  password_hash     VARCHAR(255) NOT NULL,
  password_changed  TINYINT      DEFAULT 1,   -- 0 = temp password, must change on first login
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────
--  FACILITIES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facilities (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  facility_id VARCHAR(20)  UNIQUE NOT NULL,   -- KE-FAC-XXXX
  name        VARCHAR(150) NOT NULL,
  county      VARCHAR(100) NOT NULL,
  status      ENUM('active','inactive') DEFAULT 'active',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────
--  ROLE PROFILE TABLES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_admins (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  user_id   VARCHAR(20) NOT NULL REFERENCES users(user_id),
  full_name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS hospital_admins (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     VARCHAR(20)  NOT NULL REFERENCES users(user_id),
  full_name   VARCHAR(100) NOT NULL,
  facility_id VARCHAR(20)  NOT NULL REFERENCES facilities(facility_id)
);

CREATE TABLE IF NOT EXISTS doctors (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        VARCHAR(20)  NOT NULL REFERENCES users(user_id),
  full_name      VARCHAR(100) NOT NULL,
  license_no     VARCHAR(30)  NOT NULL,
  specialization VARCHAR(80)  NOT NULL,
  facility_id    VARCHAR(20)  NOT NULL REFERENCES facilities(facility_id),
  phone          VARCHAR(20)  NULL
);

CREATE TABLE IF NOT EXISTS emergency_personnel (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         VARCHAR(20)  NOT NULL REFERENCES users(user_id),
  full_name       VARCHAR(100) NOT NULL,
  em_role         VARCHAR(80)  NOT NULL,
  emergency_token VARCHAR(20)  NOT NULL,
  facility_id     VARCHAR(20)  NOT NULL REFERENCES facilities(facility_id)
);

CREATE TABLE IF NOT EXISTS patients (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  user_id           VARCHAR(20)  NOT NULL REFERENCES users(user_id),
  full_name         VARCHAR(100) NOT NULL,
  national_id       VARCHAR(20),
  phone             VARCHAR(20),
  facility_id       VARCHAR(20)  NULL REFERENCES facilities(facility_id),
  blood_type        VARCHAR(5)   DEFAULT NULL,
  allergies         TEXT         DEFAULT NULL,
  email             VARCHAR(150) NULL,
  date_of_birth     DATE         NULL,
  gender            VARCHAR(20)  NULL,
  emergency_contact VARCHAR(150) NULL,
  next_of_kin       VARCHAR(150) NULL
);

-- ─────────────────────────────────────────────────────────────
--  MEDICAL RECORDS & CONSENT
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medical_records (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  patient_id  VARCHAR(20) NOT NULL,
  doctor_id   VARCHAR(20) NOT NULL,
  facility_id VARCHAR(20) NOT NULL,
  record_type VARCHAR(60) NOT NULL,
  notes       TEXT        NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS consents (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  patient_id VARCHAR(20) NOT NULL,
  doctor_id  VARCHAR(20) NOT NULL,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP DEFAULT NULL,
  UNIQUE KEY unique_consent (patient_id, doctor_id)
);

-- ─────────────────────────────────────────────────────────────
--  AUDIT LOGS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  actor_id   VARCHAR(20)  NOT NULL,
  actor_role VARCHAR(30)  NULL,
  action     VARCHAR(100) NOT NULL,
  detail     TEXT,
  record_id  VARCHAR(40)  NULL,
  log_hash   VARCHAR(80),
  previous_hash VARCHAR(64) NOT NULL DEFAULT '',
  current_hash  VARCHAR(64) NOT NULL DEFAULT '',
  verification_status ENUM('verified','tampered','legacy') NOT NULL DEFAULT 'legacy',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────
--  SEED: one system admin so the chain can start
--  Login → role: System admin | User ID: KE-SYS-00001 | Password: Admin@1234
-- ─────────────────────────────────────────────────────────────
-- Hash below is bcrypt of "Admin@1234" (generated with PHP password_hash)
-- After import, log in with: role=System admin, ID=KE-SYS-00001, password=Admin@1234
-- IMPORTANT: change this password after first login.
INSERT IGNORE INTO users (user_id, role, password_hash)
VALUES ('KE-SYS-00001', 'system_admin', '$2y$12$RgWGgas6F3d0iKTtCg7c3ublmKB.CQeML7rHKPHZ4WC8DbfsvedMG');

INSERT IGNORE INTO system_admins (user_id, full_name)
VALUES ('KE-SYS-00001', 'D. Cheruiyot');

-- Genesis block — start of the audit hash chain (see helpers.php chain_hash()).
-- INSERT IGNORE has no natural unique key to ignore on here, so guard with NOT EXISTS instead.
INSERT INTO audit_logs (actor_id, actor_role, action, detail, record_id, log_hash, previous_hash, current_hash, verification_status, created_at)
SELECT 'SYSTEM', 'system', 'genesis_block', 'Genesis block - start of verifiable hash chain', NULL,
       '0xGENESIS', REPEAT('0', 64),
       SHA2(CONCAT(REPEAT('0',64), '|SYSTEM|system|genesis_block|Genesis block - start of verifiable hash chain||', NOW()), 256),
       'verified', NOW()
WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE action = 'genesis_block');

-- ─────────────────────────────────────────────────────────────
--  OTP REQUESTS  (so patient can poll and see pending requests)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_requests (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  patient_id       VARCHAR(20)  NOT NULL,
  doctor_id        VARCHAR(20)  NOT NULL,
  otp              VARCHAR(10)  NULL DEFAULT NULL,        -- NULL until patient approves
  expires_at       DATETIME     NULL DEFAULT NULL,        -- NULL until OTP is generated
  reason           TEXT         NULL,                     -- doctor's stated reason
  record_types     VARCHAR(255) NULL,                     -- JSON array of requested record types
  hospital_name    VARCHAR(150) NULL,                     -- doctor's facility name (for patient display)
  patient_approved TINYINT      DEFAULT 0,                -- 1 once patient clicks Approve
  used             TINYINT      DEFAULT 0,                -- 1 once OTP verified OR request denied
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_patient_pending (patient_id, used)
);

-- ─────────────────────────────────────────────────────────────
--  AUTH TOKENS  (tab-isolated login — lets one browser run a doctor
--  tab and a patient tab at the same time without one logging the
--  other out, unlike plain cookie-based PHP sessions)
-- ─────────────────────────────────────────────────────────────
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
