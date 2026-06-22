<?php
// helpers.php — shared utilities loaded by every API file

require_once __DIR__ . '/db.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// ── JSON output helpers ──────────────────────────────────────
function json_ok(array $data = []): never {
    header('Content-Type: application/json');
    echo json_encode(['ok' => true] + $data);
    exit;
}

function json_err(string $msg, int $code = 400): never {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

// ── Tab-isolated token auth ───────────────────────────────────
// Plain $_SESSION is shared by every tab in the same browser (one cookie =
// one session file), so logging in as a doctor in one tab silently knocks
// out a patient logged in on another tab, and vice versa. To let a person
// test multiple roles side-by-side in the same browser, every login issues
// a random token that the front end stores in sessionStorage (which IS
// tab-isolated) and sends back on every request via the X-Auth-Token header.

function current_token(): ?string {
    $hdr = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? null;
    if ($hdr) return trim($hdr);
    // Fallback: some proxies forward it as a normal Authorization header
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? null;
    if ($auth && stripos($auth, 'Bearer ') === 0) return trim(substr($auth, 7));
    return null;
}

function issue_token(array $user): string {
    $token   = bin2hex(random_bytes(32));
    // Prune expired tokens so the table doesn't grow unboundedly
    db()->exec('DELETE FROM auth_tokens WHERE expires_at < NOW()');
    db()->prepare(
        'INSERT INTO auth_tokens (token, user_id, role, profile_json, expires_at)
         VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 12 HOUR))'
    )->execute([$token, $user['user_id'], $user['role'], json_encode($user)]);
    return $token;
}

function current_user_from_token(): ?array {
    $token = current_token();
    if (!$token) return null;
    $stmt = db()->prepare(
        'SELECT user_id, role, profile_json FROM auth_tokens
         WHERE token = ? AND expires_at > NOW() LIMIT 1'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    if (!$row) return null;
    $profile = json_decode($row['profile_json'], true) ?: [];
    return ['user_id' => $row['user_id'], 'role' => $row['role']] + $profile;
}

// ── Session guard: require a specific role (or any logged-in user) ──
function require_role(string ...$roles): array {
    $user = current_user_from_token();
    if (!$user) {
        json_err('Not authenticated', 401);
    }
    if (!empty($roles) && !in_array($user['role'], $roles, true)) {
        json_err('Forbidden', 403);
    }
    return $user;
}

// ── Unique ID generators ─────────────────────────────────────
function gen_patient_id(): string {
    // KE-HID-XXXXX (5 digits)
    return 'KE-HID-' . str_pad(random_int(10000, 99999), 5, '0', STR_PAD_LEFT);
}

function gen_staff_id(string $prefix): string {
    // prefix = STF / ADM / EMG / SYS
    return 'KE-' . $prefix . '-' . str_pad(random_int(1000, 9999), 4, '0', STR_PAD_LEFT);
}

function gen_facility_id(): string {
    return 'KE-FAC-' . str_pad(random_int(1, 9999), 4, '0', STR_PAD_LEFT);
}

function gen_emergency_token(): string {
    return 'EMG-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
}

function gen_temp_password(int $len = 10): string {
    $chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789@#!';
    $pw = '';
    for ($i = 0; $i < $len; $i++) {
        $pw .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return $pw;
}

// ── Audit logger ─────────────────────────────────────────────
function audit(string $actor_id, string $action, string $detail = ''): void {
    $hash = '0x' . substr(hash('sha256', $actor_id . $action . $detail . microtime()), 0, 8);
    db()->prepare(
        'INSERT INTO audit_logs (actor_id, action, detail, log_hash) VALUES (?,?,?,?)'
    )->execute([$actor_id, $action, $detail, $hash]);
}
