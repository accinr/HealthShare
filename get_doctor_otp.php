<?php
// get_doctor_otp.php — doctor polls this after requesting access.
// When the patient approves, this returns the generated OTP so the doctor's
// dashboard can display "Access Approved — OTP: XXXXXX  Expiry: 5 minutes".
// The doctor must manually type the OTP into the verification field.
require_once __DIR__ . '/helpers.php';

$doctor = require_role('doctor');

$patient_id = trim($_GET['patient_id'] ?? '');
if (!$patient_id) json_err('Patient ID is required.');

$stmt = db()->prepare(
    'SELECT id, used, patient_approved, otp, expires_at, created_at
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
    // Request was consumed or denied — check for active consent
    $consent = db()->prepare(
        'SELECT id FROM consents
          WHERE patient_id = ? AND doctor_id = ? AND revoked_at IS NULL
            AND granted_at >= ?
          LIMIT 1'
    );
    $consent->execute([$patient_id, $doctor['user_id'], $req['created_at']]);
    // If otp was never generated (patient denied), no consent exists
    if ($consent->fetch()) {
        json_ok(['status' => 'access_granted']);
    } else {
        json_ok(['status' => 'denied']);
    }
}

// Pending request — patient hasn't acted yet
if (!$req['otp']) {
    json_ok(['status' => 'pending']);
}

// OTP exists — check expiry
if (strtotime($req['expires_at']) < time()) {
    json_ok(['status' => 'expired']);
}

// Patient approved and OTP is live — show it to the doctor
if ((int)$req['patient_approved'] === 1) {
    json_ok([
        'status'     => 'approved',
        'otp'        => $req['otp'],
        'expires_at' => $req['expires_at'],
    ]);
}

// Should not normally reach here
json_ok(['status' => 'pending']);