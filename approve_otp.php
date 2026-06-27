<?php
// approve_otp.php — patient approves the pending access request.
// THIS is where the OTP is generated, stored in MySQL, anchored on blockchain,
// and SMSed to the doctor's registered phone (via Ping.Africa).
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/sidecar.php';
require_once __DIR__ . '/send_sms.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$patient = require_role('patient');

// Find the most recent pending (un-used, no OTP yet) request for this patient
$stmt = db()->prepare(
    'SELECT id, doctor_id FROM otp_requests
      WHERE patient_id = ? AND used = 0 AND otp IS NULL
      ORDER BY created_at DESC
      LIMIT 1'
);
$stmt->execute([$patient['user_id']]);
$req = $stmt->fetch();

if (!$req) json_err('No pending access request found. It may have already been handled.');

// Generate a 6-digit OTP and set a 5-minute expiry
$otp        = str_pad(random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
$expires_at = date('Y-m-d H:i:s', strtotime('+5 minutes'));

// Try to anchor via blockchain sidecar first so both systems use the same OTP
$chain = sidecar_post('/approveAccessRequest', [
    'patientId' => $patient['user_id'],
    'doctorId'  => $req['doctor_id'],
    'otp'       => $otp,
]);
$blockchain_synced = !empty($chain['ok']);

// Store OTP in MySQL and mark patient as approved
db()->prepare(
    'UPDATE otp_requests
        SET otp = ?, expires_at = ?, patient_approved = 1
      WHERE id = ?'
)->execute([$otp, $expires_at, $req['id']]);

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

// SMS: notify the doctor with the OTP via Ping.Africa (non-fatal)
$sms_sent = false;
$doc_stmt = db()->prepare('SELECT full_name, phone FROM doctors WHERE user_id = ?');
$doc_stmt->execute([$req['doctor_id']]);
$doctor = $doc_stmt->fetch();

if ($doctor && !empty($doctor['phone'])) {
    $patient_name = $patient['full_name'] ?? $patient['user_id'];
    $sms_sent = send_sms(
        $doctor['phone'],
        "HealthShare: Patient {$patient_name} approved your records request. " .
        "OTP: {$otp}. Valid for 5 minutes. Enter this on your dashboard to gain access."
    );
}

audit($patient['user_id'], 'otp_patient_approved', "Doctor: {$req['doctor_id']}");
audit($patient['user_id'], 'otp_generated',        "Doctor: {$req['doctor_id']}");

json_ok([
    'message'    => 'Approved. The doctor has been notified.',
    'otp'        => $otp,
    'expires_at' => $expires_at,
    'blockchain' => $blockchain_synced,
    'sms_sent'   => $sms_sent,
]);