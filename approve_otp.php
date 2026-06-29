<?php
// approve_otp.php — patient approves the pending access request.
// THIS is where the OTP is generated, stored in MySQL, and anchored on blockchain.
// The OTP is sent to the PATIENT via SMS only — never shown on screen, never emailed.
// The doctor must ask the patient for the code verbally.
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/sidecar.php';
require_once __DIR__ . '/NotificationService.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$patient = require_role('patient');

// Find the most recent pending (un-used, no OTP yet) request for this patient
$stmt = db()->prepare(
    'SELECT o.id, o.doctor_id, o.hospital_name,
            d.full_name AS doctor_name
       FROM otp_requests o
       JOIN doctors d ON d.user_id = o.doctor_id
      WHERE o.patient_id = ? AND o.used = 0 AND o.otp IS NULL
      ORDER BY o.created_at DESC
      LIMIT 1'
);
$stmt->execute([$patient['user_id']]);
$req = $stmt->fetch();

if (!$req) json_err('No pending access request found. It may have already been handled.');

// Generate a 6-digit OTP.
// Expiry is set by MySQL (NOW() + INTERVAL 5 MINUTE) to avoid PHP/MySQL timezone drift.
$otp = str_pad(random_int(100000, 999999), 6, '0', STR_PAD_LEFT);

// Anchor on blockchain before writing to MySQL so both systems use the same OTP
$chain = sidecar_post('/approveAccessRequest', [
    'patientId' => $patient['user_id'],
    'doctorId'  => $req['doctor_id'],
    'otp'       => $otp,
]);
$blockchain_synced = !empty($chain['ok']);

// Store OTP using MySQL server time — keeps expiry check in verify_otp.php consistent
db()->prepare(
    'UPDATE otp_requests
        SET otp = ?, expires_at = NOW() + INTERVAL 5 MINUTE, patient_approved = 1
      WHERE id = ?'
)->execute([$otp, $req['id']]);

// Read back the MySQL-generated expiry and seconds_remaining for the JS countdown
$expiry_row = db()->prepare(
    'SELECT expires_at,
            GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), expires_at)) AS seconds_remaining
       FROM otp_requests WHERE id = ?'
);
$expiry_row->execute([$req['id']]);
$expiry_data  = $expiry_row->fetch();
$expires_at   = $expiry_data['expires_at'];
$seconds_left = (int)$expiry_data['seconds_remaining'];

// Blockchain: anchor events (non-fatal)
sidecar_post('/anchorEvent', [
    'event'     => 'patient_approved',
    'patientId' => $patient['user_id'],
    'doctorId'  => $req['doctor_id'],
]);
sidecar_post('/anchorEvent', [
    'event'     => 'otp_generated',
    'patientId' => $patient['user_id'],
    'doctorId'  => $req['doctor_id'],
]);

audit($patient['user_id'], 'otp_patient_approved', "Doctor: {$req['doctor_id']}");
audit($patient['user_id'], 'otp_generated',        "Doctor: {$req['doctor_id']}");

// SMS: send the OTP directly to the patient's phone (primary delivery channel).
// The OTP is NEVER returned in the API response or shown on any dashboard.
$doctor_name = $req['doctor_name'] ?? 'the doctor';
$patient_phone = $patient['phone'] ?? null;

$notif = new NotificationService();
$sms_sent = $notif->notifyOtpToPatient($patient_phone, $otp, $doctor_name);

// NOTE: $otp is intentionally NOT included in the JSON response.
// The only way the doctor can get the code is by asking the patient,
// who received it via SMS.
json_ok([
    'message'           => 'Approved. Your verification code has been sent to your phone via SMS. Share it with the doctor.',
    'expires_at'        => $expires_at,
    'seconds_remaining' => $seconds_left,
    'blockchain'        => $blockchain_synced,
    'sms_sent'          => $sms_sent,
]);
