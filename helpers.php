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

// ── Session guard: require a specific role (or any logged-in user) ──
function require_role(string ...$roles): array {
    if (empty($_SESSION['user'])) {
        json_err('Not authenticated', 401);
    }
    if (!empty($roles) && !in_array($_SESSION['user']['role'], $roles, true)) {
        json_err('Forbidden', 403);
    }
    return $_SESSION['user'];
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
