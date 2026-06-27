<?php
// register_doctor.php — POST {full_name, license_no, specialization, email}
// Requires: hospital_admin session
// Returns: {ok, staff_id, temp_password, full_name, email_sent}

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/send_mail.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$admin = require_role('hospital_admin');

$body           = json_decode(file_get_contents('php://input'), true) ?? [];
$full_name      = trim($body['full_name']      ?? '');
$license_no     = trim($body['license_no']     ?? '');
$specialization = trim($body['specialization'] ?? '');
$email          = trim($body['email']          ?? '');
$phone          = trim($body['phone']          ?? '');

if (!$full_name || !$license_no) {
    json_err('Full name and license number are required.');
}

if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_err('A valid email address is required to send login credentials.');
}

// Admin's facility
$fac = db()->prepare(
    'SELECT ha.facility_id, f.name AS facility_name
       FROM hospital_admins ha
       JOIN facilities f ON f.facility_id = ha.facility_id
      WHERE ha.user_id = ?'
);
$fac->execute([$admin['user_id']]);
$row = $fac->fetch();
if (!$row) json_err('Admin facility not found.', 500);
$facility_id   = $row['facility_id'];
$facility_name = $row['facility_name'];

// Generate unique doctor staff ID (KE-STF-XXXX)
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
        'INSERT INTO doctors (user_id, full_name, license_no, specialization, facility_id, phone)
         VALUES (?,?,?,?,?,?)'
    )->execute([$staff_id, $full_name, $license_no, $specialization ?: 'General Practice', $facility_id, $phone]);

    audit($admin['user_id'], 'doctor_registered', "$full_name ($staff_id)");
    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    json_err('Registration failed: ' . $e->getMessage());
}

// Record on blockchain — IDs and facility only, no PII on-chain
require_once __DIR__ . '/sidecar.php';
sidecar_post('/registerDoctor', [
    'staffId'    => $staff_id,
    'facilityId' => $facility_id,
    'recordHash' => hash('sha256', $staff_id . $license_no . $facility_id),
]);

// Send credentials email via PHPMailer (non-fatal)
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