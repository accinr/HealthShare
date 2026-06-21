<?php
// sidecar.php — calls the Node.js blockchain sidecar on port 3001

function sidecar_post(string $endpoint, array $data): array {
    $url = 'http://localhost:3001' . $endpoint;
    $ch  = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode($data),
        CURLOPT_TIMEOUT        => 10,
    ]);
    $response = curl_exec($ch);
    curl_close($ch);
    return json_decode($response, true) ?? ['ok' => false, 'error' => 'No response from blockchain'];
}

function sidecar_get(string $endpoint, array $params = []): array {
    $url = 'http://localhost:3001' . $endpoint;
    if (!empty($params)) $url .= '?' . http_build_query($params);
    $ch  = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
    ]);
    $response = curl_exec($ch);
    curl_close($ch);
    return json_decode($response, true) ?? ['ok' => false, 'error' => 'No response from blockchain'];
}
