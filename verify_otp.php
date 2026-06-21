<?php
// verify_otp.php — doctor submits OTP → consent granted on blockchain
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/sidecar.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$doctor = require_role('doctor');

$body       = json_decode(file_get_contents('php://input'), true) ?? [];
$patient_id = trim($body['patient_id'] ?? '');
$otp        = trim($body['otp']        ?? '');

if (!$patient_id || !$otp) json_err('Patient ID and OTP are required.');

$result = sidecar_post('/verifyOTPAndGrant', [
    'patientId' => $patient_id,
    'doctorId'  => $doctor['user_id'],
    'otp'       => $otp,
]);

if (!$result['ok']) json_err($result['error'] ?? 'OTP verification failed.');

audit($doctor['user_id'], 'consent_granted', "Patient: $patient_id");

json_ok(['message' => 'Access granted.']);
