<?php
// sms_test.php — Standalone Ping Africa SMS diagnostic
// ─────────────────────────────────────────────────────────────
// Run from the command line:
//   php sms_test.php +254712345678
//   php sms_test.php 0712345678
//
// Or via browser (restrict to local/admin access):
//   https://yourserver/sms_test.php?phone=0712345678
//
// This script tests the SMS pipeline WITHOUT requiring a user registration.
// It loads the exact same config and SmsService used in production.
// ─────────────────────────────────────────────────────────────

// ── Determine target phone ────────────────────────────────────────────────
$phone = $argv[1] ?? ($_GET['phone'] ?? '');
if (empty($phone)) {
    die("Usage: php sms_test.php <phone_number>\nExample: php sms_test.php 0712345678\n");
}

require_once __DIR__ . '/sms_config.php';

$config    = _sms_config();
$token     = trim($config['api_key']   ?? '');
$sender_id = trim($config['sender_id'] ?? '');
$base_url  = trim($config['base_url']  ?? '');
$timeout   = (int)($config['timeout']  ?? 10);

// ── Normalise phone ───────────────────────────────────────────────────────
$raw_phone = $phone;
$phone     = preg_replace('/\s+/', '', $phone);
if (preg_match('/^\+254\d{9}$/', $phone)) {
    // already correct
} elseif (preg_match('/^254(\d{9})$/', $phone, $m)) {
    $phone = '+254' . $m[1];
} elseif (preg_match('/^0(\d{9})$/', $phone, $m)) {
    $phone = '+254' . $m[1];
}

// ── Build payload ─────────────────────────────────────────────────────────
$message = "HealthShare SMS test at " . date('Y-m-d H:i:s') . ". If you received this, Ping Africa delivery is working correctly.";
$payload = json_encode([
    'recipient' => $phone,
    'sender_id' => $sender_id,
    'message'   => $message,
]);

// ── Print pre-send diagnostics ────────────────────────────────────────────
echo "\n=== HealthShare SMS Diagnostic ===\n\n";
echo "Config source   : sms_config.php\n";
echo "Endpoint        : $base_url\n";
echo "Recipient       : $phone  (raw input: $raw_phone)\n";
echo "Sender ID       : $sender_id\n";
echo "Token (tail -8) : ..." . substr($token, -8) . "\n";
echo "Token length    : " . strlen($token) . " chars\n";
echo "Has trailing sp : " . (($token !== rtrim($token)) ? "YES ← BUG" : "no") . "\n";
echo "Message         : $message\n";
echo "Payload JSON    : $payload\n\n";

// ── Send ──────────────────────────────────────────────────────────────────
echo "Sending...\n";
$ch = curl_init($base_url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Accept: application/json',
        'Authorization: Bearer ' . $token,
    ],
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_TIMEOUT        => $timeout,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
]);

$response   = curl_exec($ch);
$curl_errno = curl_errno($ch);
$curl_error = curl_error($ch);
$http_code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$total_time = curl_getinfo($ch, CURLINFO_TOTAL_TIME);
$info       = curl_getinfo($ch);
curl_close($ch);

// ── Print post-send diagnostics ───────────────────────────────────────────
echo "\n=== Response ===\n\n";
echo "HTTP Status     : $http_code\n";
echo "Total time      : {$total_time}s\n";
echo "cURL errno      : $curl_errno\n";
echo "cURL error      : " . ($curl_error ?: 'none') . "\n";
echo "Response body   : " . ($response !== false ? $response : '(no response / transport error)') . "\n";

if ($response) {
    $data = json_decode($response, true);
    echo "\nDecoded response:\n";
    print_r($data);

    $ok = (isset($data['status']) && $data['status'] === 'success') || !empty($data['success']);
    echo "\n=== RESULT: " . ($ok ? "✓ SMS SENT SUCCESSFULLY" : "✗ SMS FAILED") . " ===\n";

    if (!$ok) {
        $api_msg = $data['message'] ?? $data['error'] ?? $data['msg'] ?? '(no message field)';
        echo "API error message: $api_msg\n";
        echo "\nCommon causes:\n";
        if ($http_code === 401) echo "  • 401 Unauthorized → API token is invalid, expired, or has a trailing space\n";
        if ($http_code === 422) echo "  • 422 Unprocessable → Sender ID not registered in Ping Africa dashboard, or phone format wrong\n";
        if ($http_code === 402) echo "  • 402 Payment Required → Insufficient SMS credits\n";
        if ($http_code === 429) echo "  • 429 Too Many Requests → Rate limit hit\n";
    }
} elseif ($curl_errno) {
    echo "\n=== RESULT: ✗ TRANSPORT ERROR ===\n";
    echo "cURL error $curl_errno: $curl_error\n";
    if ($curl_errno === 28) echo "  • Timeout — server unreachable or very slow\n";
    if ($curl_errno === 60) echo "  • SSL certificate verification failed\n";
    if ($curl_errno === 6)  echo "  • Could not resolve host — DNS failure or no internet\n";
}

echo "\n";
