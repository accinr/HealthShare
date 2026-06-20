<?php
// login.php — POST {user_id, password, role}
// Returns: {ok, user: {user_id, role, name, ...}}

require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$body    = json_decode(file_get_contents('php://input'), true) ?? [];
$user_id = trim($body['user_id'] ?? '');
$password = $body['password'] ?? '';
$role    = $body['role'] ?? '';

if (!$user_id || !$password || !$role) {
    json_err('User ID, password and role are required.');
}

// Map front-end role value → DB enum value
$role_map = [
    'patient'        => 'patient',
    'doctor'         => 'doctor',
    'hospital-admin' => 'hospital_admin',
    'system-admin'   => 'system_admin',
    'emergency'      => 'emergency',
];
$db_role = $role_map[$role] ?? null;
if (!$db_role) json_err('Unknown role.');

// Look up user
$stmt = db()->prepare('SELECT * FROM users WHERE user_id = ? AND role = ?');
$stmt->execute([$user_id, $db_role]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    json_err('Invalid credentials. Check your User ID, role, and password.');
}

// Load role-specific profile
$profile = [];
switch ($db_role) {
    case 'patient':
        $p = db()->prepare('SELECT full_name, phone FROM patients WHERE user_id = ?');
        $p->execute([$user_id]);
        $profile = $p->fetch() ?: [];
        break;

    case 'doctor':
        $p = db()->prepare(
            'SELECT d.full_name, d.specialization, d.license_no, f.name AS facility_name
             FROM doctors d
             JOIN facilities f ON f.facility_id = d.facility_id
             WHERE d.user_id = ?'
        );
        $p->execute([$user_id]);
        $profile = $p->fetch() ?: [];
        break;

    case 'hospital_admin':
        $p = db()->prepare(
            'SELECT ha.full_name, f.name AS facility_name, f.facility_id
             FROM hospital_admins ha
             JOIN facilities f ON f.facility_id = ha.facility_id
             WHERE ha.user_id = ?'
        );
        $p->execute([$user_id]);
        $profile = $p->fetch() ?: [];
        break;

    case 'system_admin':
        $p = db()->prepare('SELECT full_name FROM system_admins WHERE user_id = ?');
        $p->execute([$user_id]);
        $profile = $p->fetch() ?: [];
        break;

    case 'emergency':
        $p = db()->prepare(
            'SELECT ep.full_name, ep.em_role, ep.emergency_token, f.name AS facility_name
             FROM emergency_personnel ep
             JOIN facilities f ON f.facility_id = ep.facility_id
             WHERE ep.user_id = ?'
        );
        $p->execute([$user_id]);
        $profile = $p->fetch() ?: [];
        break;
}

$session_user = [
    'user_id' => $user['user_id'],
    'role'    => $user['role'],
] + $profile;

$_SESSION['user'] = $session_user;

audit($user_id, 'login', 'Role: ' . $db_role);

json_ok(['user' => $session_user]);
