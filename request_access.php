<?php
// request_access.php — doctor requests access to patient records
// Returns OTP to display to patient
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/sidecar.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$doctor = require_role('doctor');

$body      = json_decode(file_get_contents('php://input'), true) ?? [];
$patient_id = trim($body['patient_id'] ?? '');

if (!$patient_id) json_err('Patient ID is required.');

// Verify patient exists
$chk = db()->prepare('SELECT user_id FROM patients WHERE user_id = ?');
$chk->execute([$patient_id]);
if (!$chk->fetch()) json_err('Patient not found.');

// Request access via sidecar — gets OTP back
$result = sidecar_post('/requestAccess', [
    'patientId' => $patient_id,
    'doctorId'  => $doctor['user_id'],
]);

if (!$result['ok']) json_err($result['error'] ?? 'Blockchain error.');

audit($doctor['user_id'], 'access_requested', "Patient: $patient_id");

json_ok([
    'otp'        => $result['otp'],
    'expires_at' => $result['expiresAt'],
]);
