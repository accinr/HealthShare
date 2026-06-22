<?php
// get_consents.php — returns active consents for the logged-in patient
require_once __DIR__ . '/helpers.php';

$patient = require_role('patient');

$stmt = db()->prepare(
    'SELECT c.id, c.doctor_id, d.full_name AS doctor_name, d.specialization,
            f.name AS facility, c.granted_at
     FROM consents c
     JOIN doctors d ON d.user_id = c.doctor_id
     JOIN facilities f ON f.facility_id = d.facility_id
     WHERE c.patient_id = ? AND c.revoked_at IS NULL
     ORDER BY c.granted_at DESC'
);
$stmt->execute([$patient['user_id']]);
$consents = $stmt->fetchAll();

json_ok(['consents' => $consents]);
