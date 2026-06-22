<?php
// revoke_consent.php — patient revokes a doctor's access
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$patient = require_role('patient');

$body      = json_decode(file_get_contents('php://input'), true) ?? [];
$doctor_id = trim($body['doctor_id'] ?? '');

if (!$doctor_id) json_err('Doctor ID is required.');

db()->prepare(
    'UPDATE consents SET revoked_at = NOW()
     WHERE patient_id = ? AND doctor_id = ? AND revoked_at IS NULL'
)->execute([$patient['user_id'], $doctor_id]);

audit($patient['user_id'], 'consent_revoked', "Doctor: $doctor_id");

json_ok(['message' => 'Access revoked.']);
