<?php
// verify_otp.php — doctor submits OTP → consent granted
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/sidecar.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$doctor = require_role('doctor');

$body       = json_decode(file_get_contents('php://input'), true) ?? [];
$patient_id = trim($body['patient_id'] ?? '');
$otp        = preg_replace('/\s+/', '', trim($body['otp'] ?? ''));  // strip spaces (e.g. "123 456")

if (!$patient_id || !$otp) json_err('Patient ID and OTP are required.');

// Look up the OTP in MySQL
$stmt = db()->prepare(
    'SELECT id FROM otp_requests
     WHERE patient_id = ? AND doctor_id = ? AND otp = ? AND used = 0 AND patient_approved = 1 AND expires_at > NOW()
     LIMIT 1'
);
$stmt->execute([$patient_id, $doctor['user_id'], $otp]);
$row = $stmt->fetch();

if (!$row) {
    json_err('Incorrect or expired OTP. Ask the patient to check their dashboard for the current code.');
}

// Mark OTP as used
db()->prepare('UPDATE otp_requests SET used = 1 WHERE id = ?')->execute([$row['id']]);

// Save consent to MySQL
db()->prepare(
    'INSERT INTO consents (patient_id, doctor_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE granted_at = NOW(), revoked_at = NULL'
)->execute([$patient_id, $doctor['user_id']]);

// Also tell the blockchain sidecar (non-fatal)
sidecar_post('/verifyOTPAndGrant', [
    'patientId' => $patient_id,
    'doctorId'  => $doctor['user_id'],
    'otp'       => $otp,
]);

audit($doctor['user_id'], 'consent_granted', "Patient: $patient_id");

json_ok(['message' => 'Access granted.']);
