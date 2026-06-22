<?php
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/sidecar.php';

require_role('system_admin', 'hospital_admin');

// Check sidecar is reachable and pull real network details from it
$status = sidecar_get('/status');
$connected = $status['ok'] ?? false;

json_ok([
    'connected'  => $connected,
    'channel'    => $status['channel']   ?? ($connected ? 'healthshare' : '—'),
    'chaincode'  => $status['chaincode'] ?? ($connected ? 'healthshare' : '—'),
    'peers'      => $connected ? (is_array($status['peers'] ?? null) ? count($status['peers']) : (int)($status['peers'] ?? 0)) : 0,
    'status'     => $connected ? 'active' : 'unreachable',
    'checked_at' => date('d M H:i:s'),
]);
