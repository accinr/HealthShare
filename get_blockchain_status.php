<?php
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/sidecar.php';

// Check sidecar is reachable
$status = sidecar_get('/status');

json_ok([
    'connected'  => $status['ok'] ?? false,
    'channel'    => 'healthshare',
    'chaincode'  => 'healthshare',
    'peers'      => 2,
    'status'     => $status['ok'] ? 'active' : 'unreachable',
    'checked_at' => date('d M H:i:s'),
]);
