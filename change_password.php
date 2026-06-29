<?php
// change_password.php — POST {current_password, new_password}
// Allows any authenticated user to change their own password.
// SMS notification is sent on successful reset (non-fatal).

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/NotificationService.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

// All roles may change their own password (including patients on first login)
$user = require_role('patient', 'doctor', 'hospital_admin', 'system_admin', 'emergency');

$body             = json_decode(file_get_contents('php://input'), true) ?? [];
$current_password = $body['current_password'] ?? '';
$new_password     = trim($body['new_password']     ?? '');

if (!$current_password || !$new_password) {
    json_err('Current password and new password are required.');
}
if (strlen($new_password) < 8) {
    json_err('New password must be at least 8 characters.');
}
if (!preg_match('/[A-Z]/', $new_password)) {
    json_err('New password must contain at least one uppercase letter.');
}
if (!preg_match('/[0-9]/', $new_password)) {
    json_err('New password must contain at least one number.');
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

// Hash and save; also mark password_changed = 1 so the first-login
// redirect never triggers again for this user.
$new_hash = password_hash($new_password, PASSWORD_BCRYPT);
db()->prepare('UPDATE users SET password_hash = ?, password_changed = 1 WHERE user_id = ?')
    ->execute([$new_hash, $user['user_id']]);

audit($user['user_id'], 'password_changed', 'User changed their own password');

// SMS: notify user their password was changed (non-fatal, only if phone available)
$phone = null;
$role  = $user['role'];
try {
    if ($role === 'patient') {
        $p = db()->prepare('SELECT phone FROM patients WHERE user_id = ?');
        $p->execute([$user['user_id']]);
        $phone = $p->fetchColumn() ?: null;
    } elseif ($role === 'doctor') {
        $p = db()->prepare('SELECT phone FROM doctors WHERE user_id = ?');
        $p->execute([$user['user_id']]);
        $phone = $p->fetchColumn() ?: null;
    }
    if ($phone) {
        (new NotificationService())->notifyPasswordReset($phone);
    }
} catch (Throwable $e) {
    error_log('change_password.php SMS notification failed: ' . $e->getMessage());
}

json_ok(['message' => 'Password updated successfully.']);
