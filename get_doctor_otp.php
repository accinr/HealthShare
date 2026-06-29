<?php
// get_doctor_otp.php — doctor polls this after requesting access.
// When the patient approves, the OTP is sent to the PATIENT via SMS.
// The doctor must ask the patient verbally for the code — it is NOT shown here.
require_once __DIR__ . '/helpers.php';

$doctor = require_role('doctor');

$patient_id = trim($_GET['patient_id'] ?? '');
if (!$patient_id) json_err('Patient ID is required.');

$stmt = db()->prepare(
    'SELECT id, used, patient_approved, otp, expires_at, created_at,
            GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), expires_at)) AS seconds_remaining
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

// Patient approved and OTP is live.
// OTP is intentionally NOT returned — the patient received it via SMS.
// The doctor must ask the patient for the code verbally.
if ((int)$req['patient_approved'] === 1) {
    json_ok([
        'status'            => 'approved',
        'expires_at'        => $req['expires_at'],
        'seconds_remaining' => (int)$req['seconds_remaining'],
        // 'otp' is deliberately omitted — doctor must obtain it from the patient
    ]);
}

// Should not normally reach here
json_ok(['status' => 'pending']);
