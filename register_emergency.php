<?php
// register_emergency.php — POST {full_name, em_role}
// Requires: hospital_admin session
// Returns: {ok, staff_id, emergency_token, temp_password, full_name}

require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$admin = require_role('hospital_admin');

$body      = json_decode(file_get_contents('php://input'), true) ?? [];
$full_name = trim($body['full_name'] ?? '');
$em_role   = trim($body['em_role']   ?? '');

if (!$full_name || !$em_role) {
    json_err('Full name and role are required.');
}

// Admin's facility
$fac = db()->prepare('SELECT facility_id FROM hospital_admins WHERE user_id = ?');
$fac->execute([$admin['user_id']]);
$row = $fac->fetch();
if (!$row) json_err('Admin facility not found.', 500);
$facility_id = $row['facility_id'];

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

json_ok([
    'staff_id'        => $staff_id,
    'emergency_token' => $emergency_token,
    'temp_password'   => $temp_password,
    'full_name'       => $full_name,
]);
