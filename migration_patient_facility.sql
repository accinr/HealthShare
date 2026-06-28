-- migration_patient_facility.sql
-- Run ONCE in phpMyAdmin (select healthshare database first).
-- Adds primary hospital to the patients table.

USE healthshare;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS facility_id VARCHAR(20) NULL
    REFERENCES facilities(facility_id)
    AFTER phone;

-- Existing patients: leave facility_id NULL.
-- They can be updated manually or will be set on next registration.
