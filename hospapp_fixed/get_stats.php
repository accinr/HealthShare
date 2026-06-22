<?php
// get_stats.php — GET → counts for the stat cards
require_once __DIR__ . '/helpers.php';

$user = require_role('system_admin', 'hospital_admin');

if ($user['role'] === 'system_admin') {
    $facilities = db()->query('SELECT COUNT(*) FROM facilities')->fetchColumn();
    $admins     = db()->query('SELECT COUNT(*) FROM hospital_admins')->fetchColumn();
    $policies   = 4; // static for now
    json_ok(['facilities' => (int)$facilities, 'hospital_admins' => (int)$admins, 'policies' => $policies]);
} else {
    // Hospital admin stats
    $fac = db()->prepare('SELECT facility_id FROM hospital_admins WHERE user_id = ?');
    $fac->execute([$user['user_id']]);
    $row = $fac->fetch();
    $fid = $row['facility_id'] ?? '';

    $docs = db()->prepare('SELECT COUNT(*) FROM doctors WHERE facility_id = ?');
    $docs->execute([$fid]);
    $emps = db()->prepare('SELECT COUNT(*) FROM emergency_personnel WHERE facility_id = ?');
    $emps->execute([$fid]);

    json_ok([
        'doctors'             => (int)$docs->fetchColumn(),
        'emergency_personnel' => (int)$emps->fetchColumn(),
        'security_alerts'     => 0,
    ]);
}
