<?php
// register_patient.php — POST {full_name, national_id, phone, password}
// Returns: {ok, health_id}

require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$body        = json_decode(file_get_contents('php://input'), true) ?? [];
$full_name   = trim($body['full_name']   ?? '');
$national_id = trim($body['national_id'] ?? '');
$phone       = trim($body['phone']       ?? '');
$password    = $body['password'] ?? '';

if (!$full_name || !$national_id || !$phone || !$password) {
    json_err('All fields are required.');
}
if (strlen($password) < 6) {
    json_err('Password must be at least 6 characters.');
}

// Check national ID not already registered
$chk = db()->prepare('SELECT id FROM patients WHERE national_id = ?');
$chk->execute([$national_id]);
if ($chk->fetch()) {
    json_err('This national ID is already registered.');
}

// Generate unique health ID
do {
    $health_id = gen_patient_id();
    $exists = db()->prepare('SELECT id FROM users WHERE user_id = ?');
    $exists->execute([$health_id]);
} while ($exists->fetch());

$hash = password_hash($password, PASSWORD_BCRYPT);

$pdo = db();
$pdo->beginTransaction();
try {
    $pdo->prepare('INSERT INTO users (user_id, role, password_hash) VALUES (?,?,?)')
        ->execute([$health_id, 'patient', $hash]);

    $pdo->prepare('INSERT INTO patients (user_id, full_name, national_id, phone) VALUES (?,?,?,?)')
        ->execute([$health_id, $full_name, $national_id, $phone]);

    audit($health_id, 'patient_registered', $full_name);
    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    json_err('Registration failed. Please try again.');
}
require_once __DIR__ . '/sidecar.php';
sidecar_post('/registerPatient', [
    'patientId' => $health_id,
    'fullName'  => $full_name,
    'phone'     => $phone,
]);

json_ok(['health_id' => $health_id]);
