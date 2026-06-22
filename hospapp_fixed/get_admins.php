<?php
// get_admins.php — GET → all hospital admins with facility name
require_once __DIR__ . '/helpers.php';
require_role('system_admin');

$stmt = db()->query(
    'SELECT ha.user_id AS staff_id, ha.full_name, f.name AS facility_name, f.facility_id
     FROM hospital_admins ha
     JOIN facilities f ON f.facility_id = ha.facility_id
     ORDER BY ha.id DESC'
);
json_ok(['admins' => $stmt->fetchAll()]);
