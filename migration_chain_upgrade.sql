-- migration_chain_upgrade.sql
-- Run ONCE in phpMyAdmin (select the healthshare database first).
--
-- Adds the columns needed for a real tamper-evident hash chain on top of
-- audit_logs. Existing rows are marked verification_status='legacy' and
-- left with empty hashes — we deliberately do NOT fabricate retroactive
-- hashes for old data; a hash chain is only meaningful for entries that
-- were hashed correctly at insert time. The chain starts fresh from the
-- genesis row below, and every audit() call from now on extends it.

USE healthshare;

ALTER TABLE audit_logs
  ADD COLUMN actor_role VARCHAR(30) NULL AFTER actor_id,
  ADD COLUMN record_id VARCHAR(40) NULL AFTER detail,
  ADD COLUMN previous_hash VARCHAR(64) NOT NULL DEFAULT '' AFTER log_hash,
  ADD COLUMN current_hash VARCHAR(64) NOT NULL DEFAULT '' AFTER previous_hash,
  ADD COLUMN verification_status ENUM('verified','tampered','legacy') NOT NULL DEFAULT 'legacy' AFTER current_hash;

-- Genesis block: previous_hash is 64 zeros by convention. current_hash uses
-- the exact same formula as chain_hash() in helpers.php so verify_chain()
-- can confirm it on the very first read. Guarded so re-running this file
-- doesn't insert a second genesis row.
INSERT INTO audit_logs (actor_id, actor_role, action, detail, record_id, log_hash, previous_hash, current_hash, verification_status, created_at)
SELECT 'SYSTEM', 'system', 'genesis_block', 'Genesis block - start of verifiable hash chain', NULL,
       '0xGENESIS', REPEAT('0', 64),
       SHA2(CONCAT(REPEAT('0',64), '|SYSTEM|system|genesis_block|Genesis block - start of verifiable hash chain||', NOW()), 256),
       'verified', NOW()
WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE action = 'genesis_block');
