<?php
// get_patient_stats.php — stat counts for the patient dashboard
require_once __DIR__ . '/helpers.php';

$patient = require_role('patient');
$uid = $patient['user_id'];

$records = db()->prepare('SELECT COUNT(*) FROM medical_records WHERE patient_id = ?');
$records->execute([$uid]);

$prescriptions = db()->prepare(
    "SELECT COUNT(*) FROM medical_records WHERE patient_id = ? AND record_type = 'Prescription'"
);
$prescriptions->execute([$uid]);

$consents = db()->prepare(
    'SELECT COUNT(*) FROM consents WHERE patient_id = ? AND revoked_at IS NULL'
);
$consents->execute([$uid]);

json_ok([
    'records'       => (int)$records->fetchColumn(),
    'prescriptions' => (int)$prescriptions->fetchColumn(),
    'consents'      => (int)$consents->fetchColumn(),
]);
