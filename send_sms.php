<?php
// send_sms.php — Ping.Africa SMS sender
// Usage: send_sms('+254712345678', 'Your message here');
// Returns true on success, false on failure (non-fatal — never block the main flow).

function send_sms(string $phone, string $message): bool {
    $api_key = '58|bqZgAmD61HkCpkcTpd3qHuuqMzMhDQfwynOGUZjP0ceb556e ';  // ← drop your new Ping.Africa token here

    // Normalise phone: 0712… → +254712…
    $phone = preg_replace('/^\+?254/', '+254', $phone);
    if (preg_match('/^0(\d{9})$/', $phone, $m)) {
        $phone = '+254' . $m[1];
    }

    $payload = json_encode([
        'recipient' => $phone,
        'sender_id' => 'HealthShare',
        'message'   => $message,
    ]);

    $ch = curl_init('https://api.bulk.ping.africa/api/sms/send');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Accept: application/json',
            'Authorization: Bearer ' . $api_key,
        ],
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_CONNECTTIMEOUT => 3,
    ]);

    $response = curl_exec($ch);
    $err      = curl_errno($ch);
    curl_close($ch);

    if ($err || !$response) return false;

    $data = json_decode($response, true);
    // Ping.Africa returns {"status":"success",...} or {"success":true,...}
    return isset($data['status']) && $data['status'] === 'success'
        || !empty($data['success']);
}