<?php
// get_facilities.php — GET → all registered facilities
require_once __DIR__ . '/helpers.php';
require_role('system_admin');

$stmt = db()->query('SELECT facility_id, name, county, status FROM facilities ORDER BY id DESC');
json_ok(['facilities' => $stmt->fetchAll()]);
