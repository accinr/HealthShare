<?php
// deny_otp.php — patient denies the pending access request.
// Marks the request used=1 without ever generating an OTP.
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/sidecar.php';
require_once __DIR__ . '/NotificationService.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$patient = require_role('patient');

// Find the pending request (otp IS NULL means it hasn't been generated yet,
// or we accept any unused request including one the patient just approved in error)
$stmt = db()->prepare(
    'SELECT id, doctor_id FROM otp_requests
      WHERE patient_id = ? AND used = 0
      ORDER BY created_at DESC
      LIMIT 1'
);
$stmt->execute([$patient['user_id']]);
$req = $stmt->fetch();

if (!$req) json_err('No pending request to deny.');

// Invalidate — set used=1; otp stays NULL (never generated on denial)
db()->prepare('UPDATE otp_requests SET used = 1 WHERE id = ?')
    ->execute([$req['id']]);

// Blockchain: anchor denial event (non-fatal)
sidecar_post('/anchorEvent', [
    'event'     => 'access_denied',
    'patientId' => $patient['user_id'],
    'doctorId'  => $req['doctor_id'],
]);

audit($patient['user_id'], 'otp_denied', "Doctor: {$req['doctor_id']} — Patient denied access request");

// SMS: notify patient their denial was recorded (non-fatal)
$patient_phone = $patient['phone'] ?? null;
(new NotificationService())->notifyConsentDenied($patient_phone);

json_ok(['message' => 'Request denied.', 'doctor_id' => $req['doctor_id']]);
