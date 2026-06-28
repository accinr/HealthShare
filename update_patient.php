<?php
// update_patient.php — POST {health_id, ...fields}
// Updates demographic info for a patient belonging to the admin's facility.
// Requires: hospital_admin session

require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$admin = require_role('hospital_admin');

$body    = json_decode(file_get_contents('php://input'), true) ?? [];
$health_id = trim($body['health_id'] ?? '');
if (!$health_id) json_err('Patient Health ID is required.');

// Confirm patient belongs to this admin's facility
$fac = db()->prepare('SELECT facility_id FROM hospital_admins WHERE user_id = ?');
$fac->execute([$admin['user_id']]);
$fac_row = $fac->fetch();
if (!$fac_row) json_err('Admin facility not found.', 500);
$facility_id = $fac_row['facility_id'];

$chk = db()->prepare('SELECT id FROM patients WHERE user_id = ? AND facility_id = ?');
$chk->execute([$health_id, $facility_id]);
if (!$chk->fetch()) json_err('Patient not found at your facility.');

// Only update fields that were sent (allow partial updates)
$allowed = ['full_name','phone','email','date_of_birth','gender','blood_type','allergies','emergency_contact','next_of_kin'];
$sets = []; $params = [];
foreach ($allowed as $field) {
    if (array_key_exists($field, $body)) {
        $sets[]   = "$field = ?";
        $params[] = $body[$field] === '' ? null : trim($body[$field]);
    }
}
if (empty($sets)) json_err('No fields to update.');

// Basic validation for fields present
if (isset($body['email']) && $body['email'] !== '' && !filter_var($body['email'], FILTER_VALIDATE_EMAIL)) {
    json_err('Invalid email address.');
}
if (isset($body['phone']) && $body['phone'] !== '') {
    if (!preg_match('/^0[0-9]{9}$/', preg_replace('/\s/', '', $body['phone']))) {
        json_err('Enter a valid Kenyan phone number.');
    }
}

$params[] = $health_id;
$params[] = $facility_id;
db()->prepare('UPDATE patients SET ' . implode(', ', $sets) . ' WHERE user_id = ? AND facility_id = ?')
   ->execute($params);

audit($admin['user_id'], 'patient_updated', "Updated demographics for $health_id");

json_ok(['updated' => true]);
