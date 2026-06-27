<?php
// lookup_patient.php — emergency patient lookup
// Requires: emergency session
//
// Three modes (all via GET):
//   ?id=KE-HID-XXXXX               — Health ID (original, unchanged)
//   ?search=<value>&type=national_id — search by national ID
//   ?search=<value>&type=phone       — search by phone number
//
// Audit logging is handled separately by breakglass_log.php.

require_once __DIR__ . '/helpers.php';

$em_user = require_role('emergency');

$patient_id = trim($_GET['id']     ?? '');
$search     = trim($_GET['search'] ?? '');
$type       = trim($_GET['type']   ?? 'national_id');

// ── Mode 1: Health ID lookup (original behaviour, unchanged) ─────────
if ($patient_id) {
    $stmt = db()->prepare(
        'SELECT u.user_id, p.full_name, p.phone, p.blood_type, p.allergies
           FROM users u
           JOIN patients p ON p.user_id = u.user_id
          WHERE u.user_id = ? AND u.role = "patient"'
    );
    $stmt->execute([$patient_id]);
    $patient = $stmt->fetch();
    if (!$patient) json_err('No patient found with that Health ID.');
    json_ok(['patient' => $patient, 'matched_by' => 'health_id']);
}

// ── Mode 2: Search by national ID or phone ───────────────────────────
if ($search) {
    if ($type === 'phone') {
        // Normalise: +254712… or 254712… → 0712…
        $normalised = preg_replace('/^\+?254/', '0', $search);
        $normalised = preg_replace('/\s+/', '', $normalised);
        $stmt = db()->prepare(
            'SELECT u.user_id, p.full_name, p.phone, p.blood_type, p.allergies
               FROM users u
               JOIN patients p ON p.user_id = u.user_id
              WHERE (p.phone = ? OR p.phone = ?) AND u.role = "patient"
              LIMIT 1'
        );
        $stmt->execute([$search, $normalised]);
    } else {
        // national_id — strip spaces/dashes before comparing
        $clean = preg_replace('/[\s\-]/', '', $search);
        $stmt = db()->prepare(
            'SELECT u.user_id, p.full_name, p.phone, p.blood_type, p.allergies
               FROM users u
               JOIN patients p ON p.user_id = u.user_id
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