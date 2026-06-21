<?php
// register_facility.php — POST {name, county}
// Requires: system_admin session
// Returns: {ok, facility_id, name, county}

require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

require_role('system_admin');
$sys_admin = $_SESSION['user'];

$body   = json_decode(file_get_contents('php://input'), true) ?? [];
$name   = trim($body['name']   ?? '');
$county = trim($body['county'] ?? '');

if (!$name || !$county) {
    json_err('Facility name and county are required.');
}

// Generate unique facility ID
do {
    $facility_id = gen_facility_id();
    $exists = db()->prepare('SELECT id FROM facilities WHERE facility_id = ?');
    $exists->execute([$facility_id]);
} while ($exists->fetch());

db()->prepare(
    'INSERT INTO facilities (facility_id, name, county) VALUES (?,?,?)'
)->execute([$facility_id, $name, $county]);

audit($sys_admin['user_id'], 'facility_registered', "$name ($facility_id) in $county");
require_once __DIR__ . '/sidecar.php';
sidecar_post('/auditLog', [
    'actorId' => $sys_admin['user_id'],
    'action'  => 'facility_registered',
    'detail'  => "$name ($facility_id) in $county",
]);
json_ok(['facility_id' => $facility_id, 'name' => $name, 'county' => $county]);
