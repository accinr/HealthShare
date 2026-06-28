<?php
// get_facilities_public.php — public list of active facilities for patient registration.
// No auth required — patient is not yet logged in when they register.
require_once __DIR__ . '/helpers.php';

$stmt = db()->query(
    "SELECT facility_id, name, county
       FROM facilities
      WHERE status = 'active'
      ORDER BY name ASC"
);
json_ok(['facilities' => $stmt->fetchAll()]);
