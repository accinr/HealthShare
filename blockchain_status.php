<?php
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/sidecar.php';

// Require any logged in user
require_role('system_admin', 'hospital_admin', 'doctor', 'patient', 'emergency');

// Get recent audit logs from blockchain via sidecar
$logs = sidecar_get('/getAuditLogs');

header('Content-Type: application/json');
echo json_encode($logs);
