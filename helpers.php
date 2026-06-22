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

// ── Hash-chain audit logger ─────────────────────────────────
// Each row's current_hash = SHA-256(previous_hash | actor_id | actor_role |
// action | detail | record_id | created_at). previous_hash is always the
// prior chained row's current_hash, so editing any field of any row breaks
// either that row's own recomputed hash, or the next row's link — both are
// detectable by verify_chain(). The old version hashed in microtime(),
// which is never stored anywhere and therefore impossible to verify later;
// that's fixed here.

function genesis_hash(): string {
    return str_repeat('0', 64);
}

function chain_hash(string $prev, string $actor_id, string $actor_role, string $action, string $detail, ?string $record_id, string $created_at): string {
    return hash('sha256', $prev . '|' . $actor_id . '|' . $actor_role . '|' . $action . '|' . $detail . '|' . ($record_id ?? '') . '|' . $created_at);
}

function audit(string $actor_id, string $action, string $detail = '', ?string $record_id = null): void {
    $pdo = db();

    $role_stmt = $pdo->prepare('SELECT role FROM users WHERE user_id = ?');
    $role_stmt->execute([$actor_id]);
    $actor_role = $role_stmt->fetchColumn() ?: 'system';

    $prev_stmt = $pdo->query("SELECT current_hash FROM audit_logs WHERE current_hash != '' ORDER BY id DESC LIMIT 1");
    $previous_hash = $prev_stmt->fetchColumn() ?: genesis_hash();

    $created_at   = date('Y-m-d H:i:s');
    $current_hash = chain_hash($previous_hash, $actor_id, $actor_role, $action, $detail, $record_id, $created_at);
    $log_hash     = '0x' . substr($current_hash, 0, 8); // short display hash, unchanged format for old UI bits

    $pdo->prepare(
        'INSERT INTO audit_logs
            (actor_id, actor_role, action, detail, record_id, log_hash, previous_hash, current_hash, verification_status, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)'
    )->execute([$actor_id, $actor_role, $action, $detail, $record_id, $log_hash, $previous_hash, $current_hash, 'verified', $created_at]);
}

// ── Tamper detection ──────────────────────────────────────────
// Walks every chained row (current_hash != '') in id order and checks both:
//  1. previous_hash matches the prior row's current_hash (link integrity)
//  2. recomputing the hash from this row's own stored fields matches its
//     stored current_hash (content integrity)
// Either failing flags that row as tampered. Legacy rows (pre-migration,
// current_hash = '') are excluded — they were never part of a real chain.
function verify_chain(): array {
    $rows = db()->query(
        "SELECT id, actor_id, actor_role, action, detail, record_id, previous_hash, current_hash, created_at
         FROM audit_logs WHERE current_hash != '' ORDER BY id ASC"
    )->fetchAll();

    $expected_prev = genesis_hash();
    $verified = 0;
    $tampered = 0;
    $tampered_ids = [];

    foreach ($rows as $row) {
        $recomputed = chain_hash(
            $expected_prev, $row['actor_id'], $row['actor_role'] ?? '',
            $row['action'], $row['detail'] ?? '', $row['record_id'], $row['created_at']
        );
        $ok = ($row['previous_hash'] === $expected_prev) && hash_equals($recomputed, $row['current_hash']);
        if ($ok) { $verified++; } else { $tampered++; $tampered_ids[] = (int)$row['id']; }
        $expected_prev = $row['current_hash']; // keep walking forward to surface every break, not just the first
    }

    return [
        'chain_valid'     => $tampered === 0 && count($rows) > 0,
        'verified_blocks' => $verified,
        'tampered_blocks' => $tampered,
        'tampered_ids'    => $tampered_ids,
        'total_blocks'    => count($rows),
        'genesis_hash'    => genesis_hash(),
    ];
}
