<?php
// change_password.php — POST {current_password, new_password}
// Allows hospital_admin, doctor, and emergency personnel to change their own password.
// Does NOT touch blockchain — password management is not a blockchain concern.

require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

// Any of these three roles may call this endpoint
$user = require_role('hospital_admin', 'doctor', 'emergency');

$body            = json_decode(file_get_contents('php://input'), true) ?? [];
$current_password = $body['current_password'] ?? '';
$new_password     = trim($body['new_password']     ?? '');

if (!$current_password || !$new_password) {
    json_err('Current password and new password are required.');
}
if (strlen($new_password) < 8) {
    json_err('New password must be at least 8 characters.');
}

// Fetch stored hash
$stmt = db()->prepare('SELECT password_hash FROM users WHERE user_id = ?');
$stmt->execute([$user['user_id']]);
$row = $stmt->fetch();

if (!$row || !password_verify($current_password, $row['password_hash'])) {
    json_err('Current password is incorrect.');
}

if (password_verify($new_password, $row['password_hash'])) {
    json_err('New password must be different from the current password.');
}

// Hash and save
$new_hash = password_hash($new_password, PASSWORD_BCRYPT);
db()->prepare('UPDATE users SET password_hash = ? WHERE user_id = ?')
    ->execute([$new_hash, $user['user_id']]);

audit($user['user_id'], 'password_changed', 'User changed their own password');

json_ok(['message' => 'Password updated successfully.']);