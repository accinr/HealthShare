<?php
// reissue_patient_credentials.php — POST {health_id}
// Generates a new temporary password for a patient at the admin's facility.
// Requires: hospital_admin session

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/send_mail.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$admin = require_role('hospital_admin');

$body      = json_decode(file_get_contents('php://input'), true) ?? [];
$health_id = trim($body['health_id'] ?? '');
if (!$health_id) json_err('Patient Health ID is required.');

// Confirm patient belongs to this admin's facility
$fac = db()->prepare(
    'SELECT ha.facility_id, f.name AS facility_name
       FROM hospital_admins ha
       JOIN facilities f ON f.facility_id = ha.facility_id
      WHERE ha.user_id = ?'
);
$fac->execute([$admin['user_id']]);
$fac_row = $fac->fetch();
if (!$fac_row) json_err('Admin facility not found.', 500);
$facility_id   = $fac_row['facility_id'];
$facility_name = $fac_row['facility_name'];

$chk = db()->prepare(
    'SELECT p.full_name, p.email FROM patients p WHERE p.user_id = ? AND p.facility_id = ?'
);
$chk->execute([$health_id, $facility_id]);
$patient = $chk->fetch();
if (!$patient) json_err('Patient not found at your facility.');

$temp_password = gen_temp_password();
$hash = password_hash($temp_password, PASSWORD_BCRYPT);

// Reset password and mark as unchanged so patient must change on next login
db()->prepare(
    'UPDATE users SET password_hash = ?, password_changed = 0 WHERE user_id = ?'
)->execute([$hash, $health_id]);

audit($admin['user_id'], 'patient_credentials_reissued', "Reissued credentials for $health_id");

// Email new credentials if patient has an email (non-fatal)
$email_sent = false;
if (!empty($patient['email'])) {
    $email_sent = send_credentials_email($patient['email'], $patient['full_name'], [
        'role'          => 'Patient',
        'staff_id'      => $health_id,
        'temp_password' => $temp_password,
        'facility_name' => $facility_name,
    ]);
}

json_ok([
    'health_id'     => $health_id,
    'temp_password' => $temp_password,
    'full_name'     => $patient['full_name'],
    'email_sent'    => $email_sent,
]);
