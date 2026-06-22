<?php
// register_hospital_admin.php — POST {full_name, facility_id}
// Requires: system_admin session
// Returns: {ok, staff_id, temp_password, full_name, facility_name}

require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$sys_admin = require_role('system_admin');

$body        = json_decode(file_get_contents('php://input'), true) ?? [];
$full_name   = trim($body['full_name']   ?? '');
$facility_id = trim($body['facility_id'] ?? '');

if (!$full_name || !$facility_id) {
    json_err('Full name and facility are required.');
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

    $pdo->prepare(
        'INSERT INTO hospital_admins (user_id, full_name, facility_id) VALUES (?,?,?)'
    )->execute([$staff_id, $full_name, $facility_id]);

    audit($sys_admin['user_id'], 'hospital_admin_registered', "$full_name ($staff_id) → $facility_id");
    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    json_err('Registration failed. Please try again.');
}
require_once __DIR__ . '/sidecar.php';
sidecar_post('/registerAdmin', [
    'staffId'    => $staff_id,
    'fullName'   => $full_name,
    'facilityId' => $facility_id,
]);

json_ok([
    'staff_id'      => $staff_id,
    'temp_password' => $temp_password,
    'full_name'     => $full_name,
    'facility_name' => $facility['name'],
]);
