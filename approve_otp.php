<?php
// approve_otp.php — patient approves the pending access request.
// Sets patient_approved=1 so the doctor is notified to enter the OTP.
// Consent is only granted after the doctor successfully enters the OTP
// in verify_otp.php — the patient approval is a prerequisite, not the grant.
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$patient = require_role('patient');

$stmt = db()->prepare(
    'SELECT id, doctor_id, otp FROM otp_requests
     WHERE patient_id = ? AND used = 0 AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1'
);
$stmt->execute([$patient['user_id']]);
$req = $stmt->fetch();

if (!$req) json_err('No pending access request to approve. It may have expired.');

// Mark patient approved — does NOT consume the OTP yet (doctor must verify it)
db()->prepare('UPDATE otp_requests SET patient_approved = 1 WHERE id = ?')->execute([$req['id']]);

audit($patient['user_id'], 'otp_patient_approved', "Doctor: {$req['doctor_id']}");

json_ok(['message' => 'Approved. Share the access code with the doctor so they can complete verification.', 'doctor_id' => $req['doctor_id']]);
