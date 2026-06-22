<?php
// get_pending_otp.php — patient polls this to see if a doctor has requested access
// Returns the pending OTP if one exists and hasn't been used/expired
require_once __DIR__ . '/helpers.php';

$patient = require_role('patient');
$patient_id = $patient['user_id'];

$stmt = db()->prepare(
    'SELECT o.otp, o.doctor_id, o.expires_at, d.full_name AS doctor_name
     FROM otp_requests o
     JOIN doctors d ON d.user_id = o.doctor_id
     WHERE o.patient_id = ? AND o.used = 0 AND o.expires_at > NOW()
     ORDER BY o.created_at DESC
     LIMIT 1'
);
$stmt->execute([$patient_id]);
$row = $stmt->fetch();

if (!$row) {
    json_ok(['pending' => false]);
}

json_ok([
    'pending'     => true,
    'otp'         => $row['otp'],
    'doctor_name' => $row['doctor_name'],
    'expires_at'  => $row['expires_at'],
]);
