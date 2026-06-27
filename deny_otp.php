<?php
// approve_otp.php — patient approves the pending access request.
// THIS is where the OTP is generated for the first time, stored in MySQL,
// and anchored on the blockchain. The doctor is then notified via polling.
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/sidecar.php';

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

// Blockchain: anchor "OTP Generated" and "Patient Approved" events (non-fatal)
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

json_ok([
    'message'    => 'Approved. The doctor will be notified and shown the OTP on their dashboard.',
    'otp'        => $otp,
    'expires_at' => $expires_at,
    'blockchain' => $blockchain_synced,
]);