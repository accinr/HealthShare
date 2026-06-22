<?php
// deny_otp.php — patient denies OTP request
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$patient = require_role('patient');

db()->prepare(
    'UPDATE otp_requests SET used = 1 WHERE patient_id = ? AND used = 0'
)->execute([$patient['user_id']]);

audit($patient['user_id'], 'otp_denied', 'Patient denied access request');

json_ok(['message' => 'Request denied.']);
