<?php
// SmsService.php — Reusable Ping.Africa SMS sender
// ─────────────────────────────────────────────────────────────
// All API credentials come from sms_config.php — never hardcoded here.
// Returns true on success, false on any failure.
// Failures are always non-fatal — never block a registration or workflow.
// ─────────────────────────────────────────────────────────────

require_once __DIR__ . '/sms_config.php';

class SmsService {

    private array $config;

    public function __construct() {
        $this->config = _sms_config();
    }

    /**
     * Normalise a Kenyan phone number to +254XXXXXXXXX format.
     * Accepts: 0712345678  /  254712345678  /  +254712345678
     */
    private function normalise(string $phone): string {
        $phone = preg_replace('/\s+/', '', $phone);
        // Already in +254 format
        if (preg_match('/^\+254\d{9}$/', $phone)) return $phone;
        // 254XXXXXXXXX  (no leading +)
        if (preg_match('/^254(\d{9})$/', $phone, $m)) return '+254' . $m[1];
        // 07XXXXXXXXX or 01XXXXXXXXX
        if (preg_match('/^0(\d{9})$/', $phone, $m)) return '+254' . $m[1];
        return $phone; // return as-is — let the API reject it and log the response
    }

    /**
     * Send an SMS. Returns true on success, false on failure.
     */
    public function send(string $phone, string $message): bool {
        // Trim defensively — a stray trailing space in config corrupts the Bearer token
        $token     = trim($this->config['api_key']   ?? '');
        $sender_id = trim($this->config['sender_id'] ?? 'Healthshare');
        $base_url  = trim($this->config['base_url']  ?? 'https://api.bulk.ping.africa/api/sms/send');

        if (empty($token) || $token === 'PASTE_YOUR_PING_AFRICA_TOKEN_HERE') {
            error_log('HealthShare SMS: API token not configured. Edit sms_config.php.');
            return false;
        }

        $raw_phone = $phone;
        $phone     = $this->normalise($phone);
        if (!preg_match('/^\+254\d{9}$/', $phone)) {
            error_log("HealthShare SMS: Invalid phone after normalisation | Raw=[$raw_phone] Normalised=[$phone]");
            return false;
        }

        $payload = json_encode([
            'recipient' => $phone,
            'sender_id' => $sender_id,
            'message'   => $message,
        ]);

        // ── Log everything BEFORE the request ─────────────────────────────
        error_log("HealthShare SMS PRE-SEND ► Endpoint  : $base_url");
        error_log("HealthShare SMS PRE-SEND ► Recipient : $phone  (raw: $raw_phone)");
        error_log("HealthShare SMS PRE-SEND ► Sender ID : $sender_id");
        error_log("HealthShare SMS PRE-SEND ► Token tail: ..." . substr($token, -8));
        error_log("HealthShare SMS PRE-SEND ► Payload   : $payload");

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
            CURLOPT_TIMEOUT        => (int)($this->config['timeout'] ?? 10),
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);

        $response   = curl_exec($ch);
        $curl_errno = curl_errno($ch);
        $curl_error = curl_error($ch);
        $http_code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $total_time = curl_getinfo($ch, CURLINFO_TOTAL_TIME);
        curl_close($ch);

        // ── Log everything AFTER the request ──────────────────────────────
        error_log("HealthShare SMS POST-SEND ► HTTP status : $http_code");
        error_log("HealthShare SMS POST-SEND ► Time taken  : {$total_time}s");
        error_log("HealthShare SMS POST-SEND ► cURL errno  : $curl_errno");
        error_log("HealthShare SMS POST-SEND ► cURL error  : " . ($curl_error ?: 'none'));
        error_log("HealthShare SMS POST-SEND ► Response    : " . ($response !== false ? $response : '(no response)'));

        // ── Transport-level failure ────────────────────────────────────────
        if ($curl_errno || $response === false) {
            error_log("HealthShare SMS FAILED ► Transport error $curl_errno: $curl_error | to: $phone");
            return false;
        }

        // ── JSON decode ───────────────────────────────────────────────────
        $data = json_decode($response, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            error_log('HealthShare SMS FAILED ► JSON decode error: ' . json_last_error_msg() . " | HTTP $http_code | Raw: $response");
            return false;
        }

        // ── API-level success/failure ──────────────────────────────────────
        $ok = (isset($data['status']) && $data['status'] === 'success')
           || !empty($data['success']);

        if ($ok) {
            error_log("HealthShare SMS SUCCESS ► Delivered to $phone | HTTP $http_code");
        } else {
            // Extract and log the exact API error message — never swallow it
            $api_msg = $data['message'] ?? $data['error'] ?? $data['msg'] ?? json_encode($data);
            error_log("HealthShare SMS FAILED ► API error | HTTP $http_code | Message: $api_msg | Full response: $response");
        }

        return $ok;
    }

    /**
     * Convenience method: only send if phone is non-empty.
     */
    public function sendIfAvailable(?string $phone, string $message): bool {
        if (!$phone) return false;
        return $this->send($phone, $message);
    }
}
