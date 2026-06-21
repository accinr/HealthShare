<?php
// get_records.php — get patient records (CIDs) for doctor or patient
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/sidecar.php';

$user = require_role('doctor', 'patient');

$patient_id = $user['role'] === 'patient'
    ? $user['user_id']
    : trim($_GET['patient_id'] ?? '');

if (!$patient_id) json_err('Patient ID required.');

$stmt = db()->prepare(
    'SELECT r.id, r.record_type, r.notes AS cid, r.created_at, 
            d.full_name AS doctor_name, f.name AS facility_name
     FROM medical_records r
     JOIN doctors d ON d.user_id = r.doctor_id
     JOIN facilities f ON f.facility_id = r.facility_id
     WHERE r.patient_id = ?
     ORDER BY r.created_at DESC'
);
$stmt->execute([$patient_id]);
$records = $stmt->fetchAll();

json_ok(['records' => $records]);
