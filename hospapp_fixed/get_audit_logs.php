<?php
// get_audit_logs.php — GET → recent audit log entries
// System admin gets all; hospital admin gets their facility's entries
require_once __DIR__ . '/helpers.php';

$user = require_role('system_admin', 'hospital_admin');

if ($user['role'] === 'system_admin') {
    $stmt = db()->query(
        'SELECT actor_id, action, detail, log_hash,
                DATE_FORMAT(created_at, "%d %b %H:%i") AS time
         FROM audit_logs ORDER BY id DESC LIMIT 50'
    );
} else {
    // Hospital admin: logs where actor is themselves or their facility's staff
    $fac = db()->prepare('SELECT facility_id FROM hospital_admins WHERE user_id = ?');
    $fac->execute([$user['user_id']]);
    $row = $fac->fetch();
    $facility_id = $row['facility_id'] ?? '';

    // Get all staff IDs at this facility
    $docs = db()->prepare('SELECT user_id FROM doctors WHERE facility_id = ?');
    $docs->execute([$facility_id]);
    $emps = db()->prepare('SELECT user_id FROM emergency_personnel WHERE facility_id = ?');
    $emps->execute([$facility_id]);

    $ids = array_merge(
        array_column($docs->fetchAll(), 'user_id'),
        array_column($emps->fetchAll(), 'user_id')
    );
    $ids[] = $user['user_id'];

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = db()->prepare(
        "SELECT actor_id, action, detail, log_hash,
                DATE_FORMAT(created_at, '%d %b %H:%i') AS time
         FROM audit_logs WHERE actor_id IN ($placeholders)
         ORDER BY id DESC LIMIT 50"
    );
    $stmt->execute(array_values($ids));
}

json_ok(['logs' => $stmt->fetchAll()]);
