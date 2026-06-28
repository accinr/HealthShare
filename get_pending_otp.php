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
            d.full_name AS doctor_name,
            GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), o.expires_at)) AS seconds_remaining
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

// After approval, include seconds_remaining so the patient's dashboard
// can show the same live countdown as the doctor's dashboard.
if ($row['patient_approved'] && $row['expires_at']) {
    $response['seconds_remaining'] = (int)$row['seconds_remaining'];
    $response['expires_at']        = $row['expires_at'];
}

// Do NOT include the OTP itself — the doctor sees it on their own dashboard.
json_ok($response);