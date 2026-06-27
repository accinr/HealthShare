<?php
// request_access.php — doctor submits a pending access request.
// DOES NOT generate an OTP — that only happens when the patient approves (approve_otp.php).
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/sidecar.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$doctor = require_role('doctor');

$body         = json_decode(file_get_contents('php://input'), true) ?? [];
$patient_id   = trim($body['patient_id']   ?? '');
$reason       = trim($body['reason']       ?? '');
$record_types = $body['record_types']      ?? [];   // array of strings

if (!$patient_id)          json_err('Patient ID is required.');
if (!$reason)              json_err('Reason for access is required.');
if (empty($record_types))  json_err('Please select at least one record type.');

// Verify patient exists
$chk = db()->prepare('SELECT user_id FROM patients WHERE user_id = ?');
$chk->execute([$patient_id]);
if (!$chk->fetch()) json_err('Patient not found. Check the ID and try again.');

// Sanitise record types — allow only known values
$allowed = ['Consultation Notes', 'Prescriptions', 'Lab Results', 'Radiology', 'Full Record'];
$record_types = array_values(array_filter($record_types, fn($t) => in_array($t, $allowed)));
if (empty($record_types)) json_err('No valid record types selected.');

// Get the doctor's hospital name (for display on the patient side)
$fac = db()->prepare(
    'SELECT f.name FROM doctors d
     JOIN facilities f ON f.facility_id = d.facility_id
     WHERE d.user_id = ?'
);
$fac->execute([$doctor['user_id']]);
$hospital_name = $fac->fetchColumn() ?: 'Unknown Hospital';

try {
    // Invalidate any existing pending request for this pair
    db()->prepare(
        'UPDATE otp_requests SET used = 1
          WHERE patient_id = ? AND doctor_id = ? AND used = 0'
    )->execute([$patient_id, $doctor['user_id']]);

    // Create a pending request — NO otp, NO expires_at yet.
    // The OTP is generated only when the patient approves (approve_otp.php).
    db()->prepare(
        'INSERT INTO otp_requests
            (patient_id, doctor_id, otp, reason, record_types, hospital_name, expires_at)
         VALUES (?, ?, NULL, ?, ?, ?, NULL)'
    )->execute([
        $patient_id,
        $doctor['user_id'],
        $reason,
        json_encode($record_types),
        $hospital_name,
    ]);
} catch (Exception $e) {
    json_err('Database error: ' . $e->getMessage()
        . ' — Run migration_access_request_v2.sql in phpMyAdmin first.');
}

// Blockchain: anchor "Access Requested" event (non-fatal)
sidecar_post('/anchorEvent', [
    'event'     => 'access_requested',
    'patientId' => $patient_id,
    'doctorId'  => $doctor['user_id'],
    'reason'    => $reason,
]);

audit($doctor['user_id'], 'access_requested', "Patient: $patient_id | Reason: $reason");

json_ok([
    'message' => 'Request sent. Waiting for patient to approve.',
]);