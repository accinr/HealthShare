<?php
// get_doctors.php — GET → list of doctors at the admin's facility
require_once __DIR__ . '/helpers.php';

$admin = require_role('hospital_admin');

$fac = db()->prepare('SELECT facility_id FROM hospital_admins WHERE user_id = ?');
$fac->execute([$admin['user_id']]);
$row = $fac->fetch();
if (!$row) json_err('Facility not found.', 500);

$stmt = db()->prepare(
    'SELECT user_id AS staff_id, full_name, license_no, specialization
     FROM doctors WHERE facility_id = ?
     ORDER BY id DESC'
);
$stmt->execute([$row['facility_id']]);

json_ok(['doctors' => $stmt->fetchAll()]);
