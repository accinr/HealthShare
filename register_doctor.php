<?php
// register_doctor.php — POST {full_name, license_no, specialization, email}
// Requires: hospital_admin session
// Returns: {ok, staff_id, temp_password, full_name}
// NOTE: Does NOT modify blockchain logic — sidecar call is unchanged.

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/send_mail.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$admin = require_role('hospital_admin');

$body           = json_decode(file_get_contents('php://input'), true) ?? [];
$full_name      = trim($body['full_name']      ?? '');
$license_no     = trim($body['license_no']     ?? '');
$specialization = trim($body['specialization'] ?? '');
$email          = trim($body['email']          ?? '');

if (!$full_name || !$license_no || !$specialization) {
    json_err('Full name, license number and specialization are required.');
}

// Email is required so we can send credentials
if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_err('A valid email address is required to send login credentials.');
}

// Look up the admin's facility
$fac = db()->prepare('SELECT facility_id, f.name AS facility_name
    FROM hospital_admins ha
    JOIN facilities f ON f.facility_id = ha.facility_id
    WHERE ha.user_id = ?');
$fac->execute([$admin['user_id']]);
$row = $fac->fetch();
if (!$row) json_err('Admin facility not found.', 500);
$facility_id   = $row['facility_id'];
$facility_name = $row['facility_name'];

// Generate unique staff ID
do {
    $staff_id = gen_staff_id('STF');
    $exists = db()->prepare('SELECT id FROM users WHERE user_id = ?');
    $exists->execute([$staff_id]);
} while ($exists->fetch());

$temp_password = gen_temp_password();
$hash = password_hash($temp_password, PASSWORD_BCRYPT);

$pdo = db();
$pdo->beginTransaction();
try {
    $pdo->prepare('INSERT INTO users (user_id, role, password_hash) VALUES (?,?,?)')
        ->execute([$staff_id, 'doctor', $hash]);

    $pdo->prepare(
        'INSERT INTO doctors (user_id, full_name, license_no, specialization, facility_id)
         VALUES (?,?,?,?,?)'
    )->execute([$staff_id, $full_name, $license_no, $specialization, $facility_id]);

    audit($admin['user_id'], 'doctor_registered', "$full_name ($staff_id) at $facility_id");
    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    json_err('Registration failed. Please try again.');
}

// Record on blockchain — UNCHANGED from original
require_once __DIR__ . '/sidecar.php';
sidecar_post('/registerDoctor', [
    'staffId'        => $staff_id,
    'fullName'       => $full_name,
    'licenseNo'      => $license_no,
    'specialization' => $specialization,
    'facilityId'     => $facility_id,
]);

// Send credentials email via PHPMailer (non-fatal — if it fails the account still exists)
$email_sent = send_credentials_email($email, $full_name, [
    'role'          => 'Doctor',
    'staff_id'      => $staff_id,
    'temp_password' => $temp_password,
    'facility_name' => $facility_name,
]);

json_ok([
    'staff_id'      => $staff_id,
    'temp_password' => $temp_password,
    'full_name'     => $full_name,
    'email_sent'    => $email_sent,
]);