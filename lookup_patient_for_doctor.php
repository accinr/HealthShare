<?php
// lookup_patient_for_doctor.php — doctor searches for a patient before requesting access.
// Mirrors lookup_patient.php (emergency) but requires a doctor session.
//
// Three modes (all via GET):
//   ?id=KE-HID-XXXXX               — Health ID
//   ?search=<value>&type=national_id — search by national ID
//   ?search=<value>&type=phone       — search by phone number
//
// Returns: user_id, full_name, primary facility name, national_id, phone (no blood/allergies
// — those require consent, which hasn't been granted yet).

require_once __DIR__ . '/helpers.php';

$doctor = require_role('doctor');

$patient_id = trim($_GET['id']     ?? '');
$search     = trim($_GET['search'] ?? '');
$type       = trim($_GET['type']   ?? 'national_id');

// ── Mode 1: Health ID lookup ──────────────────────────────────
if ($patient_id) {
    $stmt = db()->prepare(
        'SELECT u.user_id, p.full_name, p.phone,
                f.name AS primary_facility,
                u.role
           FROM users u
           JOIN patients p ON p.user_id = u.user_id
           LEFT JOIN facilities f ON f.facility_id = (
               SELECT facility_id FROM medical_records
                WHERE patient_id = u.user_id
                ORDER BY created_at DESC LIMIT 1
           )
          WHERE u.user_id = ? AND u.role = "patient"'
    );
    $stmt->execute([$patient_id]);
    $patient = $stmt->fetch();
    if (!$patient) json_err('No patient found with that Health ID.');
    json_ok(['patient' => $patient, 'matched_by' => 'health_id']);
}

// ── Mode 2: Search by national ID or phone ────────────────────
if ($search) {
    if ($type === 'phone') {
        // Normalise: +254712… or 254712… → 0712…
        $normalised = preg_replace('/^\+?254/', '0', $search);
        $normalised = preg_replace('/\s+/', '', $normalised);
        $stmt = db()->prepare(
            'SELECT u.user_id, p.full_name, p.phone,
                    f.name AS primary_facility
               FROM users u
               JOIN patients p ON p.user_id = u.user_id
               LEFT JOIN facilities f ON f.facility_id = (
                   SELECT facility_id FROM medical_records
                    WHERE patient_id = u.user_id
                    ORDER BY created_at DESC LIMIT 1
               )
              WHERE (p.phone = ? OR p.phone = ?) AND u.role = "patient"
              LIMIT 1'
        );
        $stmt->execute([$search, $normalised]);
    } else {
        // national_id
        $clean = preg_replace('/[\s\-]/', '', $search);
        $stmt = db()->prepare(
            'SELECT u.user_id, p.full_name, p.phone,
                    f.name AS primary_facility
               FROM users u
               JOIN patients p ON p.user_id = u.user_id
               LEFT JOIN facilities f ON f.facility_id = (
                   SELECT facility_id FROM medical_records
                    WHERE patient_id = u.user_id
                    ORDER BY created_at DESC LIMIT 1
               )
              WHERE p.national_id = ? AND u.role = "patient"
              LIMIT 1'
        );
        $stmt->execute([$clean]);
    }

    $patient = $stmt->fetch();
    if (!$patient) {
        $label = $type === 'phone' ? 'phone number' : 'national ID';
        json_err("No patient found with that $label.");
    }
    json_ok(['patient' => $patient, 'matched_by' => $type]);
}

json_err('Patient Health ID, national ID, or phone number is required.');