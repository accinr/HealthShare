<?php
// get_pending_otp.php — patient polls this to see if a doctor has requested access.
// Returns request metadata (doctor name, hospital, reason, record types).
// Does NOT return the OTP — the OTP is only shown after the patient approves,
// via approve_otp.php which returns it in its response.
require_once __DIR__ . '/helpers.php';

$patient    = require_role('patient');
$patient_id = $patient['user_id'];

$stmt = db()->prepare(
    'SELECT o.id, o.doctor_id, o.reason, o.record_types, o.hospital_name,
            o.patient_approved, o.expires_at, o.otp,
            d.full_name AS doctor_name
       FROM otp_requests o
       JOIN doctors d ON d.user_id = o.doctor_id
      WHERE o.patient_id = ? AND o.used = 0
      ORDER BY o.created_at DESC
      LIMIT 1'
);
$stmt->execute([$patient_id]);
$row = $stmt->fetch();

if (!$row) {
    json_ok(['pending' => false]);
}

// Decode record types (stored as JSON array)
$record_types = json_decode($row['record_types'] ?? '[]', true) ?: [];

// If patient has already approved, also return the OTP so it can be displayed
// on the patient's screen (they share it verbally with the doctor).
$response = [
    'pending'          => true,
    'doctor_name'      => $row['doctor_name'],
    'hospital_name'    => $row['hospital_name'] ?? '—',
    'reason'           => $row['reason'] ?? '—',
    'record_types'     => $record_types,
    'patient_approved' => (bool)$row['patient_approved'],
];

// Only include OTP after patient has approved (so they can see it on their screen)
if ($row['patient_approved'] && $row['otp']) {
    $response['otp']        = $row['otp'];
    $response['expires_at'] = $row['expires_at'];
}

json_ok($response);