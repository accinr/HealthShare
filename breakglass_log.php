<?php
// breakglass_log.php — log break-glass access (called from emergency page)
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$em_user = require_role('emergency');

$body       = json_decode(file_get_contents('php://input'), true) ?? [];
$patient_id = trim($body['patient_id'] ?? '');
$reason     = trim($body['reason'] ?? 'unspecified');

if (!$patient_id) json_err('Patient ID is required.');

audit($em_user['user_id'], 'breakglass_access',
    "Patient: $patient_id | Reason: $reason | Token: " . ($em_user['emergency_token'] ?? ''));

json_ok(['message' => 'Logged.']);
