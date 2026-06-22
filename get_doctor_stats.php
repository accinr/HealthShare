<?php
// get_doctor_stats.php — stat counts for the doctor dashboard
require_once __DIR__ . '/helpers.php';

$doctor = require_role('doctor');
$uid = $doctor['user_id'];

$patients_seen = db()->prepare(
    'SELECT COUNT(DISTINCT patient_id) FROM medical_records WHERE doctor_id = ?'
);
$patients_seen->execute([$uid]);

$records_today = db()->prepare(
    'SELECT COUNT(*) FROM medical_records WHERE doctor_id = ? AND DATE(created_at) = CURDATE()'
);
$records_today->execute([$uid]);

$pending = db()->prepare(
    'SELECT COUNT(*) FROM otp_requests WHERE doctor_id = ? AND used = 0 AND expires_at > NOW()'
);
$pending->execute([$uid]);

json_ok([
    'patients_seen'   => (int)$patients_seen->fetchColumn(),
    'records_today'   => (int)$records_today->fetchColumn(),
    'pending_reviews' => (int)$pending->fetchColumn(),
]);
