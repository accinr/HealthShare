<?php
// register_patient.php — POST (hospital_admin only)
// Registers a new patient at the admin's facility.
// Returns: {ok, health_id, temp_password, full_name, email_sent}

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/send_mail.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$admin = require_role('hospital_admin');

$body              = json_decode(file_get_contents('php://input'), true) ?? [];
$full_name         = trim($body['full_name']         ?? '');
$national_id       = trim($body['national_id']       ?? '');
$phone             = trim($body['phone']             ?? '');
$email             = trim($body['email']             ?? '');
$date_of_birth     = trim($body['date_of_birth']     ?? '');
$gender            = trim($body['gender']            ?? '');
$blood_type        = trim($body['blood_type']        ?? '');
$allergies         = trim($body['allergies']         ?? '');
$emergency_contact = trim($body['emergency_contact'] ?? '');
$next_of_kin       = trim($body['next_of_kin']       ?? '');

// Required fields
if (!$full_name)         json_err('Full name is required.');
if (strlen($full_name) < 3) json_err('Full name must be at least 3 characters.');
if (!$national_id)       json_err('National ID is required.');
if (!preg_match('/^\d{7,9}$/', $national_id)) json_err('National ID must be 7–9 digits.');
if (!$phone)             json_err('Phone number is required.');
if (!preg_match('/^0[0-9]{9}$/', preg_replace('/\s/', '', $phone))) json_err('Enter a valid Kenyan phone number (e.g. 0712345678).');
if (!$date_of_birth)     json_err('Date of birth is required.');
if (!$gender)            json_err('Gender is required.');
if (!$emergency_contact) json_err('Emergency contact is required.');
if (!$next_of_kin)       json_err('Next of kin is required.');
if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) json_err('Invalid email address.');

// Derive facility from the admin's own session — never trust client-supplied facility
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

// National ID uniqueness check
$chk = db()->prepare('SELECT id FROM patients WHERE national_id = ?');
$chk->execute([$national_id]);
if ($chk->fetch()) json_err('A patient with this national ID is already registered.');

// Generate unique Health ID
do {
    $health_id = gen_patient_id();
    $exists = db()->prepare('SELECT id FROM users WHERE user_id = ?');
    $exists->execute([$health_id]);
} while ($exists->fetch());

// Generate temporary password — patient must change on first login
$temp_password = gen_temp_password();
$hash = password_hash($temp_password, PASSWORD_BCRYPT);

$pdo = db();
$pdo->beginTransaction();
try {
    // password_changed = 0 → forces password change on first login
    $pdo->prepare(
        'INSERT INTO users (user_id, role, password_hash, password_changed) VALUES (?,?,?,0)'
    )->execute([$health_id, 'patient', $hash]);

    $pdo->prepare(
        'INSERT INTO patients
           (user_id, full_name, national_id, phone, email, date_of_birth, gender,
            blood_type, allergies, emergency_contact, next_of_kin, facility_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    )->execute([
        $health_id, $full_name, $national_id, $phone,
        $email ?: null,
        $date_of_birth,
        $gender,
        $blood_type ?: null,
        $allergies ?: null,
        $emergency_contact,
        $next_of_kin,
        $facility_id,
    ]);

    audit($admin['user_id'], 'patient_registered', "$full_name ($health_id) at $facility_name");
    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    json_err('Registration failed. Please try again.');
}

// Register on blockchain — IDs and facility only, no PII on-chain
require_once __DIR__ . '/sidecar.php';
sidecar_post('/registerPatient', [
    'patientId'  => $health_id,
    'facilityId' => $facility_id,
    'recordHash' => hash('sha256', $health_id . $national_id . $facility_id),
]);

// Email credentials if email provided (non-fatal)
$email_sent = false;
if ($email) {
    $email_sent = send_credentials_email($email, $full_name, [
        'role'          => 'Patient',
        'staff_id'      => $health_id,
        'temp_password' => $temp_password,
        'facility_name' => $facility_name,
    ]);
}

json_ok([
    'health_id'     => $health_id,
    'temp_password' => $temp_password,
    'full_name'     => $full_name,
    'email_sent'    => $email_sent,
]);
