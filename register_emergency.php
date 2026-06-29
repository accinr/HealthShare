<?php
// register_emergency.php — POST {full_name, em_role, email}
// Requires: hospital_admin session
// Returns: {ok, staff_id, emergency_token, temp_password, full_name}
// NOTE: Does NOT modify blockchain logic — sidecar call is unchanged.

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/NotificationService.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$admin = require_role('hospital_admin');

$body      = json_decode(file_get_contents('php://input'), true) ?? [];
$full_name = trim($body['full_name'] ?? '');
$em_role   = trim($body['em_role']   ?? '');
$email     = trim($body['email']     ?? '');

if (!$full_name || !$em_role) {
    json_err('Full name and role are required.');
}

// Email is required so we can send credentials
if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_err('A valid email address is required to send login credentials.');
}

// Admin's facility
$fac = db()->prepare('SELECT ha.facility_id, f.name AS facility_name
    FROM hospital_admins ha
    JOIN facilities f ON f.facility_id = ha.facility_id
    WHERE ha.user_id = ?');
$fac->execute([$admin['user_id']]);
$row = $fac->fetch();
if (!$row) json_err('Admin facility not found.', 500);
$facility_id   = $row['facility_id'];
$facility_name = $row['facility_name'];

// Generate unique staff ID for emergency (KE-EMG-XXXX)
do {
    $staff_id = gen_staff_id('EMG');
    $exists = db()->prepare('SELECT id FROM users WHERE user_id = ?');
    $exists->execute([$staff_id]);
} while ($exists->fetch());

$emergency_token = gen_emergency_token();
$temp_password   = gen_temp_password();
$hash = password_hash($temp_password, PASSWORD_BCRYPT);

$pdo = db();
$pdo->beginTransaction();
try {
    $pdo->prepare('INSERT INTO users (user_id, role, password_hash) VALUES (?,?,?)')
        ->execute([$staff_id, 'emergency', $hash]);

    $pdo->prepare(
        'INSERT INTO emergency_personnel (user_id, full_name, em_role, emergency_token, facility_id)
         VALUES (?,?,?,?,?)'
    )->execute([$staff_id, $full_name, $em_role, $emergency_token, $facility_id]);

    audit($admin['user_id'], 'emergency_registered', "$full_name ($staff_id)");
    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    json_err('Registration failed. Please try again.');
}

// Record on blockchain — IDs and facility only, no PII on-chain
require_once __DIR__ . '/sidecar.php';
sidecar_post('/registerEmergency', [
    'staffId'        => $staff_id,
    'facilityId'     => $facility_id,
    'emergencyToken' => $emergency_token,
    'recordHash'     => hash('sha256', $staff_id . $emergency_token . $facility_id),
]);

// Send email + SMS via NotificationService (non-fatal)
// Emergency personnel don't have a phone column yet — pass empty string
$em_phone = '';
$notif = (new NotificationService())->notifyStaffRegistered($email, $em_phone, $full_name, [
    'role'            => 'Emergency Personnel',
    'staff_id'        => $staff_id,
    'temp_password'   => $temp_password,
    'facility_name'   => $facility_name,
    'emergency_token' => $emergency_token,
]);

json_ok([
    'staff_id'        => $staff_id,
    'emergency_token' => $emergency_token,
    'temp_password'   => $temp_password,
    'full_name'       => $full_name,
    'email_sent'      => $notif['email_sent'],
    'sms_sent'        => $notif['sms_sent'],
]);