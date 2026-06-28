<?php
// lookup_patient_doctor.php — doctor searches for a patient before requesting access.
// Returns primary hospital from patients.facility_id (set at registration).
// Flags cross-hospital access so the interoperability context is clear.

require_once __DIR__ . '/helpers.php';

$doctor = require_role('doctor');

// Get doctor's own facility_id for cross-hospital detection
$doc_fac = db()->prepare('SELECT facility_id FROM doctors WHERE user_id = ?');
$doc_fac->execute([$doctor['user_id']]);
$doctor_facility_id = $doc_fac->fetchColumn();

$patient_id = trim($_GET['id']     ?? '');
$search     = trim($_GET['search'] ?? '');
$type       = trim($_GET['type']   ?? 'national_id');

function format_patient(array $p, string $doctor_facility_id): array {
    $cross_hospital = ($p['facility_id'] && $p['facility_id'] !== $doctor_facility_id);
    return [
        'user_id'          => $p['user_id'],
        'full_name'        => $p['full_name'],
        'phone'            => $p['phone'],
        'primary_facility' => $p['facility_name'] ?? 'No primary hospital set',
        'cross_hospital'   => $cross_hospital,
    ];
}

// ── Mode 1: Health ID ─────────────────────────────────────────
if ($patient_id) {
    $stmt = db()->prepare(
        'SELECT p.user_id, p.full_name, p.phone, p.facility_id,
                f.name AS facility_name
           FROM patients p
           LEFT JOIN facilities f ON f.facility_id = p.facility_id
          WHERE p.user_id = ?'
    );
    $stmt->execute([$patient_id]);
    $row = $stmt->fetch();
    if (!$row) json_err('No patient found with that Health ID.');
    json_ok(['patient' => format_patient($row, $doctor_facility_id), 'matched_by' => 'health_id']);
}

// ── Mode 2: Search ────────────────────────────────────────────
if ($search) {
    if ($type === 'phone') {
        $norm = preg_replace('/^\+?254/', '0', $search);
        $norm = preg_replace('/\s+/', '', $norm);
        $stmt = db()->prepare(
            'SELECT p.user_id, p.full_name, p.phone, p.facility_id,
                    f.name AS facility_name
               FROM patients p
               LEFT JOIN facilities f ON f.facility_id = p.facility_id
              WHERE p.phone = ? OR p.phone = ?
              LIMIT 1'
        );
        $stmt->execute([$search, $norm]);
    } else {
        $clean = preg_replace('/[\s\-]/', '', $search);
        $stmt = db()->prepare(
            'SELECT p.user_id, p.full_name, p.phone, p.facility_id,
                    f.name AS facility_name
               FROM patients p
               LEFT JOIN facilities f ON f.facility_id = p.facility_id
              WHERE p.national_id = ?
              LIMIT 1'
        );
        $stmt->execute([$clean]);
    }
    $row = $stmt->fetch();
    if (!$row) {
        $label = $type === 'phone' ? 'phone number' : 'national ID';
        json_err("No patient found with that $label.");
    }
    json_ok(['patient' => format_patient($row, $doctor_facility_id), 'matched_by' => $type]);
}

json_err('Patient Health ID, national ID, or phone number is required.');
