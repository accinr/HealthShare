<?php
// lookup_patient_doctor.php — doctor loads patient details after consent is granted
require_once __DIR__ . '/helpers.php';

$doctor = require_role('doctor');

$patient_id = trim($_GET['id'] ?? '');
if (!$patient_id) json_err('Patient ID is required.');

// Verify active consent exists
$consent = db()->prepare(
    'SELECT id FROM consents WHERE patient_id = ? AND doctor_id = ? AND revoked_at IS NULL LIMIT 1'
);
$consent->execute([$patient_id, $doctor['user_id']]);
if (!$consent->fetch()) json_err('No active consent for this patient.', 403);

$stmt = db()->prepare(
    'SELECT u.user_id, p.full_name, p.phone, p.blood_type, p.allergies
     FROM users u JOIN patients p ON p.user_id = u.user_id
     WHERE u.user_id = ? AND u.role = "patient"'
);
$stmt->execute([$patient_id]);
$patient = $stmt->fetch();

if (!$patient) json_err('Patient not found.');

json_ok(['patient' => $patient]);
