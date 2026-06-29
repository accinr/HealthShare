<?php
// register_hospital_admin.php — POST {full_name, facility_id, email}
// Requires: system_admin session
// Returns: {ok, staff_id, temp_password, full_name, facility_name}
// NOTE: Does NOT modify blockchain logic — sidecar call is unchanged.

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/NotificationService.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$sys_admin = require_role('system_admin');

$body        = json_decode(file_get_contents('php://input'), true) ?? [];
$full_name   = trim($body['full_name']   ?? '');
$facility_id = trim($body['facility_id'] ?? '');
$email       = trim($body['email']       ?? '');

if (!$full_name || !$facility_id) {
    json_err('Full name and facility are required.');
}

// Email is required so we can send credentials
if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_err('A valid email address is required to send login credentials.');
}

// Verify facility exists
$fac = db()->prepare('SELECT name FROM facilities WHERE facility_id = ?');
$fac->execute([$facility_id]);
$facility = $fac->fetch();
if (!$facility) json_err('Facility not found.');

// Generate unique admin staff ID (KE-ADM-XXXX)
do {
    $staff_id = gen_staff_id('ADM');
    $exists = db()->prepare('SELECT id FROM users WHERE user_id = ?');
    $exists->execute([$staff_id]);
} while ($exists->fetch());

$temp_password = gen_temp_password();
$hash = password_hash($temp_password, PASSWORD_BCRYPT);

$pdo = db();
$pdo->beginTransaction();
try {
    $pdo->prepare('INSERT INTO users (user_id, role, password_hash) VALUES (?,?,?)')
        ->execute([$staff_id, 'hospital_admin', $hash]);

    // FIX: hospital_admins table has no email column (email is only used for
    // sending credentials, it is not stored). Removed email from this INSERT.
    $pdo->prepare(
        'INSERT INTO hospital_admins (user_id, full_name, facility_id) VALUES (?,?,?)'
    )->execute([$staff_id, $full_name, $facility_id]);

    try {
        audit($sys_admin['user_id'], 'hospital_admin_registered', "$full_name ($staff_id) → $facility_id");
    } catch (Throwable $e) {
        error_log('audit() failed in register_hospital_admin.php: ' . $e->getMessage());
    }
    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    json_err('Registration failed. Please try again.');
}

// Record on blockchain — UNCHANGED from original
require_once __DIR__ . '/sidecar.php';
sidecar_post('/registerAdmin', [
    'staffId'    => $staff_id,
    'fullName'   => $full_name,
    'facilityId' => $facility_id,
]);

// Send email + SMS via NotificationService (non-fatal)
// Hospital admins don't have a separate phone column — pass empty string
$notif = (new NotificationService())->notifyStaffRegistered($email, '', $full_name, [
    'role'          => 'Hospital Admin',
    'staff_id'      => $staff_id,
    'temp_password' => $temp_password,
    'facility_name' => $facility['name'],
]);

json_ok([
    'staff_id'      => $staff_id,
    'temp_password' => $temp_password,
    'full_name'     => $full_name,
    'facility_name' => $facility['name'],
    'email_sent'    => $notif['email_sent'],
    'sms_sent'      => $notif['sms_sent'],
]);
