<?php
require_once __DIR__ . '/helpers.php';
require_role('system_admin');
require_once __DIR__ . '/sidecar.php';

$result = sidecar_post('/registerDoctor', [
    'staffId'        => 'KE-STF-TEST',
    'fullName'       => 'Test Doctor',
    'licenseNo'      => 'TEST/123',
    'specialization' => 'General practice',
    'facilityId'     => 'KE-FAC-0001',
]);

echo json_encode($result);
