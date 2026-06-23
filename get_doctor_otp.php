<?php
// get_doctor_otp.php — doctor polls this after requesting access.
// Returns the patient's approval status so the doctor's dashboard knows
// when to show the OTP entry form.
require_once __DIR__ . '/helpers.php';

$doctor = require_role('doctor');

$patient_id = trim($_GET['patient_id'] ?? '');
if (!$patient_id) json_err('Patient ID is required.');

$stmt = db()->prepare(
    'SELECT id, used, patient_approved, expires_at, created_at
     FROM otp_requests
     WHERE patient_id = ? AND doctor_id = ?
     ORDER BY created_at DESC
     LIMIT 1'
);
$stmt->execute([$patient_id, $doctor['user_id']]);
$req = $stmt->fetch();

if (!$req) {
    json_ok(['status' => 'none']);
}

if ((int)$req['used'] === 1) {
    // OTP was consumed — check for active consent
    $consent = db()->prepare(
        'SELECT id FROM consents
         WHERE patient_id = ? AND doctor_id = ? AND revoked_at IS NULL AND granted_at >= ?
         LIMIT 1'
    );
    $consent->execute([$patient_id, $doctor['user_id'], $req['created_at']]);
    json_ok(['status' => $consent->fetch() ? 'access_granted' : 'denied']);
}

if (strtotime($req['expires_at']) < time()) {
    json_ok(['status' => 'expired']);
}

// Patient has approved — doctor should now enter the OTP
if ((int)$req['patient_approved'] === 1) {
    json_ok(['status' => 'approved']);
}

// Still waiting for patient
json_ok(['status' => 'pending', 'expires_at' => $req['expires_at']]);
