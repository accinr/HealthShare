<?php
// get_patients.php — GET
// Returns patients belonging to the logged-in hospital admin's facility.
// Requires: hospital_admin session

require_once __DIR__ . '/helpers.php';

$admin = require_role('hospital_admin');

$fac = db()->prepare('SELECT facility_id FROM hospital_admins WHERE user_id = ?');
$fac->execute([$admin['user_id']]);
$row = $fac->fetch();
if (!$row) json_err('Admin facility not found.', 500);
$facility_id = $row['facility_id'];

$stmt = db()->prepare(
    'SELECT p.user_id AS health_id, p.full_name, p.national_id, p.phone, p.email,
            p.date_of_birth, p.gender, p.blood_type, p.allergies,
            p.emergency_contact, p.next_of_kin,
            u.created_at AS registered_at
       FROM patients p
       JOIN users u ON u.user_id = p.user_id
      WHERE p.facility_id = ?
      ORDER BY u.created_at DESC'
);
$stmt->execute([$facility_id]);
$patients = $stmt->fetchAll();

json_ok(['patients' => $patients]);
