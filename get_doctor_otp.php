<?php
// get_doctor_otp.php — doctor polls this after requesting access
// Returns the OTP for the specific patient so the doctor can read it directly
// Only returns OTPs this doctor requested — a doctor cannot see another doctor's OTP
require_once __DIR__ . '/helpers.php';

$doctor = require_role('doctor');

$patient_id = trim($_GET['patient_id'] ?? '');
if (!$patient_id) json_err('Patient ID is required.');

$stmt = db()->prepare(
    'SELECT o.otp, o.expires_at
     FROM otp_requests o
     WHERE o.patient_id = ? AND o.doctor_id = ? AND o.used = 0 AND o.expires_at > NOW()
     ORDER BY o.created_at DESC
     LIMIT 1'
);
$stmt->execute([$patient_id, $doctor['user_id']]);
$row = $stmt->fetch();

if (!$row) {
    json_ok(['pending' => false]);
}

json_ok([
    'pending'    => true,
    'otp'        => $row['otp'],
    'expires_at' => $row['expires_at'],
]);
