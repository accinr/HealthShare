<?php
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/sidecar.php';

// Test sidecar call directly
$result = sidecar_post('/registerDoctor', [
    'staffId'        => 'KE-STF-DEBUG',
    'fullName'       => 'Debug Doctor',
    'licenseNo'      => 'DEBUG/001',
    'specialization' => 'General practice',
    'facilityId'     => 'KE-FAC-0001',
]);

echo json_encode([
    'sidecar_result' => $result,
    'sidecar_url'    => 'http://localhost:3001/registerDoctor',
]);
