<?php
// register_patient.php — POST (public — no authentication required)
// Registers a new patient account.
// May be submitted by the patient themselves or by an authorized representative
// (parent, guardian, spouse, family member, caregiver, or hospital staff)
// using the patient's details. The account always belongs to the patient.
//
// Returns: {ok, health_id, full_name, facility_name, email_sent, sms_sent}

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/NotificationService.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

// No authentication required — this is a public registration endpoint.

$body = json_decode(file_get_contents('php://input'), true) ?? [];

// ── Core fields ───────────────────────────────────────────────────────────
$full_name   = trim($body['full_name']   ?? '');
$national_id = trim($body['national_id'] ?? '');
$phone       = preg_replace('/\s+/', '', trim($body['phone'] ?? ''));
$email       = trim($body['email']       ?? '');
$facility_id = trim($body['facility_id'] ?? '');

// ── Demographic fields ────────────────────────────────────────────────────
$date_of_birth = trim($body['date_of_birth'] ?? '');
$gender        = trim($body['gender']        ?? '');
$blood_type    = trim($body['blood_type']    ?? '');
$allergies     = trim($body['allergies']     ?? '');

// ── Structured next of kin ────────────────────────────────────────────────
$next_of_kin_name         = trim($body['next_of_kin_name']         ?? '');
$next_of_kin_relationship = trim($body['next_of_kin_relationship'] ?? '');

// ── Structured emergency contact ──────────────────────────────────────────
$emergency_contact_name         = trim($body['emergency_contact_name']         ?? '');
$emergency_contact_relationship = trim($body['emergency_contact_relationship'] ?? '');
$emergency_contact_phone        = preg_replace('/\s+/', '', trim($body['emergency_contact_phone'] ?? ''));

// ── Validation ────────────────────────────────────────────────────────────
if (!$full_name)       json_err('Full name is required.');
if (strlen($full_name) < 3) json_err('Full name must be at least 3 characters.');

if (!$national_id)     json_err('National ID is required.');
if (!preg_match('/^\d{7,9}$/', $national_id)) json_err('National ID must be 7–9 digits (numbers only).');

if (!$phone)           json_err('Phone number is required.');
if (!preg_match('/^0[0-9]{9}$/', $phone)) json_err('Enter a valid Kenyan phone number (e.g. 0712345678).');

if (!$facility_id)     json_err('Please select your primary hospital.');
if (!$date_of_birth)   json_err('Date of birth is required.');
if ($date_of_birth > date('Y-m-d')) json_err('Date of birth cannot be in the future.');
if (!$gender)          json_err('Gender is required.');

if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) json_err('Invalid email address format.');

if (!$emergency_contact_name)         json_err('Emergency contact name is required.');
if (!$emergency_contact_relationship) json_err('Emergency contact relationship is required.');
if (!$emergency_contact_phone)        json_err('Emergency contact phone is required.');
if (!preg_match('/^0[0-9]{9}$/', $emergency_contact_phone)) json_err('Enter a valid Kenyan phone for emergency contact.');

if (!$next_of_kin_name)         json_err('Next of kin name is required.');
if (!$next_of_kin_relationship) json_err('Next of kin relationship is required.');

// ── Validate facility ─────────────────────────────────────────────────────
$fac = db()->prepare("SELECT name FROM facilities WHERE facility_id = ? AND status = 'active'");
$fac->execute([$facility_id]);
$facility = $fac->fetch();
if (!$facility) json_err('Selected hospital is not valid. Please choose a registered facility.');
$facility_name = $facility['name'];

// ── Uniqueness checks ──────────────────────────────────────────────────────
// National ID must be unique — each person has exactly one national ID.
$chk_nid = db()->prepare('SELECT id FROM patients WHERE national_id = ?');
$chk_nid->execute([$national_id]);
if ($chk_nid->fetch()) json_err('A patient with this national ID is already registered.');

// Phone uniqueness check is intentionally skipped in DEMO MODE.
// DEMO MODE NOTE: Duplicate phone numbers are allowed here so a single phone
// number can be reused across multiple test/demo accounts.
// In a production deployment, uncomment the block below to enforce phone uniqueness:
//
// $chk_phone = db()->prepare('SELECT id FROM patients WHERE phone = ?');
// $chk_phone->execute([$phone]);
// if ($chk_phone->fetch()) json_err('This phone number is already registered to another patient.');

if ($email) {
    $chk_email = db()->prepare('SELECT id FROM patients WHERE email = ?');
    $chk_email->execute([$email]);
    if ($chk_email->fetch()) json_err('This email address is already registered to another patient.');
}

// ── Build combined legacy values (backwards compat) ───────────────────────
$next_of_kin_combined = trim($next_of_kin_name
    . ($next_of_kin_relationship ? " ({$next_of_kin_relationship})" : ''));

$emergency_combined = trim($emergency_contact_name
    . ($emergency_contact_relationship ? " ({$emergency_contact_relationship})" : '')
    . ($emergency_contact_phone ? " — {$emergency_contact_phone}" : ''));

// ── Generate Health ID + temp password ───────────────────────────────────
do {
    $health_id = gen_patient_id();
    $exists = db()->prepare('SELECT id FROM users WHERE user_id = ?');
    $exists->execute([$health_id]);
} while ($exists->fetch());

$temp_password = gen_temp_password();
$hash = password_hash($temp_password, PASSWORD_BCRYPT);

// ── Database insert (transaction) ─────────────────────────────────────────
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
            blood_type, allergies,
            emergency_contact, next_of_kin,
            emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
            next_of_kin_name, next_of_kin_relationship,
            facility_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    )->execute([
        $health_id, $full_name, $national_id, $phone,
        $email ?: null,
        $date_of_birth,
        $gender,
        $blood_type ?: null,
        $allergies ?: null,
        $emergency_combined,
        $next_of_kin_combined,
        $emergency_contact_name,
        $emergency_contact_relationship,
        $emergency_contact_phone,
        $next_of_kin_name,
        $next_of_kin_relationship,
        $facility_id,
    ]);

    // Audit log — use the new patient's own ID as the actor since no admin is logged in
    audit($health_id, 'patient_registered', "$full_name ($health_id) at $facility_name");
    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    $msg = $e->getMessage();
    if (str_contains($msg, 'Duplicate entry')) {
        json_err('A record with this national ID or email already exists.');
    }
    json_err('Database error: ' . $msg);
}

// ── Blockchain ────────────────────────────────────────────────────────────
require_once __DIR__ . '/sidecar.php';
sidecar_post('/registerPatient', [
    'patientId'  => $health_id,
    'facilityId' => $facility_id,
    'recordHash' => hash('sha256', $health_id . $national_id . $facility_id),
]);

// ── Notifications (non-fatal) ─────────────────────────────────────────────
// SMS is sent to the entered phone number even if that number is shared
// with other demo accounts — all matching accounts receive the notification.
$notif = (new NotificationService())->notifyPatientRegistered(
    $health_id,
    $full_name,
    $email ?: null,
    $phone,
    $temp_password,
    $facility_name
);

json_ok([
    'health_id'     => $health_id,
    'full_name'     => $full_name,
    'facility_name' => $facility_name,
    'email_sent'    => $notif['email_sent'],
    'sms_sent'      => $notif['sms_sent'],
    // temp_password intentionally NOT returned — delivered via email/SMS only
]);
