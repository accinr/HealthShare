<?php
// lookup_patient.php — GET ?id=KE-HID-XXXXX
// Requires: emergency session
// Returns basic patient info for break-glass display and logs the access

require_once __DIR__ . '/helpers.php';

$em_user = require_role('emergency');

$patient_id = trim($_GET['id'] ?? '');
if (!$patient_id) json_err('Patient ID is required.');

// Verify it's a valid patient
$stmt = db()->prepare('SELECT u.user_id, p.full_name, p.phone, p.blood_type, p.allergies
    FROM users u JOIN patients p ON p.user_id = u.user_id
    WHERE u.user_id = ? AND u.role = "patient"');
$stmt->execute([$patient_id]);
$patient = $stmt->fetch();

if (!$patient) {
    json_err('No patient found with that Health ID.');
}

// Log the break-glass access
audit($em_user['user_id'], 'breakglass_access', "Patient: $patient_id | Reason: " . ($_GET['reason'] ?? 'unspecified'));

json_ok(['patient' => $patient]);
