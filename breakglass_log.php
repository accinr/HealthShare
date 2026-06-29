<?php
// breakglass_log.php — log break-glass emergency access and notify patient
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/NotificationService.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$em_user = require_role('emergency');

$body       = json_decode(file_get_contents('php://input'), true) ?? [];
$patient_id = trim($body['patient_id'] ?? '');
$reason     = trim($body['reason'] ?? 'unspecified');

if (!$patient_id) json_err('Patient ID is required.');

audit($em_user['user_id'], 'breakglass_access',
    "Patient: $patient_id | Reason: $reason | Token: " . ($em_user['emergency_token'] ?? ''));

// SMS: notify the patient that emergency access was initiated (non-fatal)
$pat_phone = db()->prepare('SELECT phone FROM patients WHERE user_id = ?');
$pat_phone->execute([$patient_id]);
$patient_phone = $pat_phone->fetchColumn() ?: null;

(new NotificationService())->notifyEmergencyAccess($patient_phone);

json_ok(['message' => 'Logged.']);
