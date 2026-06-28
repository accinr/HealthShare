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

// Also fetch primary hospital name for the patient dashboard
$fac_stmt = db()->prepare(
    'SELECT f.name FROM patients p
     LEFT JOIN facilities f ON f.facility_id = p.facility_id
     WHERE p.user_id = ?'
);
$fac_stmt->execute([$uid]);
$primary_hospital = $fac_stmt->fetchColumn() ?: null;

json_ok([
    'records'          => (int)$records->fetchColumn(),
    'prescriptions'    => (int)$prescriptions->fetchColumn(),
    'consents'         => (int)$consents->fetchColumn(),
    'primary_hospital' => $primary_hospital,
]);
