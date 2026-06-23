<?php
// get_facilities.php — GET → all registered facilities
require_once __DIR__ . '/helpers.php';
require_role('system_admin');

$stmt = db()->query('SELECT facility_id, name, county, status FROM facilities ORDER BY id DESC');

// Real actor -> facility lookup, used by the system-admin Hospital A/B
// interoperability simulation to attribute audit_logs rows to an actual
// facility instead of guessing. Cheap: one query, three small tables.
$staff = db()->query(
    "SELECT user_id, facility_id FROM doctors
     UNION SELECT user_id, facility_id FROM emergency_personnel
     UNION SELECT user_id, facility_id FROM hospital_admins"
)->fetchAll();
$staff_map = [];
foreach ($staff as $s) { $staff_map[$s['user_id']] = $s['facility_id']; }

json_ok(['facilities' => $stmt->fetchAll(), 'staff_map' => $staff_map]);
