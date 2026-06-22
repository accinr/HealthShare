<?php
// request_access.php — doctor requests access to patient records
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/sidecar.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$doctor = require_role('doctor');

$body       = json_decode(file_get_contents('php://input'), true) ?? [];
$patient_id = trim($body['patient_id'] ?? '');

if (!$patient_id) json_err('Patient ID is required.');

// Verify patient exists
$chk = db()->prepare('SELECT user_id FROM patients WHERE user_id = ?');
$chk->execute([$patient_id]);
if (!$chk->fetch()) json_err('Patient not found. Check the Health ID and try again.');

// Ask the sidecar to generate the OTP first — that way the blockchain and
// MySQL always hold the exact same code. If the sidecar is down we fall back
// to generating one locally so the app keeps working.
$chain = sidecar_post('/requestAccess', [
    'patientId' => $patient_id,
    'doctorId'  => $doctor['user_id'],
]);

if ($chain['ok'] && !empty($chain['otp'])) {
    // Use the sidecar's OTP — both systems are now in sync
    $otp               = $chain['otp'];
    $blockchain_synced = true;
} else {
    // Sidecar down — generate locally; blockchain will be out of sync until
    // the sidecar comes back, but MySQL remains the source of truth
    $otp               = str_pad(random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
    $blockchain_synced = false;
}

try {
    // Invalidate any existing pending OTP for this pair
    db()->prepare(
        'UPDATE otp_requests SET used = 1 WHERE patient_id = ? AND doctor_id = ? AND used = 0'
    )->execute([$patient_id, $doctor['user_id']]);

    // Store OTP — 5-minute expiry to match sidecar's otpStore TTL
    db()->prepare(
        'INSERT INTO otp_requests (patient_id, doctor_id, otp, expires_at)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))'
    )->execute([$patient_id, $doctor['user_id'], $otp]);
} catch (Exception $e) {
    json_err('Database error: ' . $e->getMessage() . ' — Run the otp_requests migration SQL in phpMyAdmin.');
}

audit($doctor['user_id'], 'access_requested', "Patient: $patient_id");

json_ok([
    'message'    => 'OTP generated. Ask the patient to open their dashboard — they will see the code there.',
    'blockchain' => $blockchain_synced,
]);
