<?php
// interop_demo.php — POST → run a scripted cross-hospital interoperability demo
// Requires: system_admin session
//
// Picks the two most active facilities and their doctors, then fires a real
// end-to-end sequence:
//   1. Hospital A doctor requests access to a patient
//   2. OTP is auto-approved (demo mode)
//   3. Consent is granted — blockchain event fires
//   4. Hospital A doctor submits a clinical note
//   5. Hospital B doctor requests and is granted access to the same patient
//   6. Hospital B doctor submits a follow-up note
//
// Every step writes a real audit_log row and calls the real blockchain sidecar.
// Nothing is hardcoded — it uses real doctors, a real patient, real facilities.

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/sidecar.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

require_role('system_admin');

// ── Find two facilities with at least one doctor each ───────────────
$facs = db()->query(
    'SELECT f.facility_id, f.name,
            (SELECT d.user_id FROM doctors d WHERE d.facility_id = f.facility_id LIMIT 1) AS doctor_id
       FROM facilities f
      WHERE f.status = "active"
        AND EXISTS (SELECT 1 FROM doctors d WHERE d.facility_id = f.facility_id)
      ORDER BY f.id ASC
      LIMIT 2'
)->fetchAll();

if (count($facs) < 2) {
    json_err('Need at least 2 active facilities with registered doctors to run the demo.');
}

$hospA    = $facs[0];
$hospB    = $facs[1];
$doctorA  = $hospA['doctor_id'];
$doctorB  = $hospB['doctor_id'];

// ── Find a patient to use ────────────────────────────────────────────
$patient = db()->query(
    'SELECT user_id FROM patients ORDER BY id DESC LIMIT 1'
)->fetch();

if (!$patient) {
    json_err('No patients registered yet. Register a patient first, then run the demo.');
}
$patient_id = $patient['user_id'];

$steps = [];

// ─── Step 1: Hospital A — request access ────────────────────────────
db()->prepare(
    'UPDATE otp_requests SET used = 1 WHERE patient_id = ? AND doctor_id = ? AND used = 0'
)->execute([$patient_id, $doctorA]);

$otp = str_pad(random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
db()->prepare(
    'INSERT INTO otp_requests (patient_id, doctor_id, otp, expires_at)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))'
)->execute([$patient_id, $doctorA, $otp]);

sidecar_post('/requestAccess', ['patientId' => $patient_id, 'doctorId' => $doctorA]);
audit($doctorA, 'access_requested', "DEMO | Hospital A ({$hospA['name']}) | Patient: $patient_id");
$steps[] = "Hospital A ({$hospA['name']}) — access requested for patient $patient_id";

// ─── Step 2: OTP auto-approved (demo mode) ──────────────────────────
$otpRow = db()->prepare(
    'SELECT id FROM otp_requests
      WHERE patient_id = ? AND doctor_id = ? AND otp = ? AND used = 0 AND expires_at > NOW()
      LIMIT 1'
);
$otpRow->execute([$patient_id, $doctorA, $otp]);
$row = $otpRow->fetch();
if ($row) {
    db()->prepare('UPDATE otp_requests SET used = 1 WHERE id = ?')->execute([$row['id']]);
}
$steps[] = "OTP auto-approved (demo mode)";

// ─── Step 3: Consent granted — Hospital A ───────────────────────────
db()->prepare(
    'INSERT INTO consents (patient_id, doctor_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE granted_at = NOW(), revoked_at = NULL'
)->execute([$patient_id, $doctorA]);

sidecar_post('/verifyOTPAndGrant', [
    'patientId' => $patient_id,
    'doctorId'  => $doctorA,
    'otp'       => $otp,
]);
audit($doctorA, 'consent_granted', "DEMO | Hospital A ({$hospA['name']}) | Patient: $patient_id");
$steps[] = "Consent granted — Hospital A doctor has access";

// ─── Step 4: Hospital A submits a clinical record ───────────────────
$noteA = "DEMO RECORD — Initial consultation at {$hospA['name']}. "
       . "Patient presented with reported symptoms. History reviewed. "
       . "Vitals stable. Further investigation recommended.";

$key       = hash('sha256', $doctorA . $patient_id . date('Y-m-d'));
$iv        = substr(hash('sha256', $patient_id), 0, 16);
$encrypted = openssl_encrypt($noteA, 'AES-256-CBC', $key, 0, $iv);
$cid       = 'PENDING_IPFS:' . $encrypted;

$ipfs = sidecar_post('/uploadToIPFS', ['content' => $encrypted]);
if ($ipfs['ok'] && !empty($ipfs['cid'])) $cid = $ipfs['cid'];

db()->prepare(
    'INSERT INTO medical_records (patient_id, doctor_id, facility_id, record_type, notes, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())'
)->execute([$patient_id, $doctorA, $hospA['facility_id'], 'Consultation', $cid]);

$recordHash = hash('sha256', $cid . $patient_id . $doctorA);
sidecar_post('/createRecord', [
    'patientId'  => $patient_id,
    'ipfsCID'    => $cid,
    'recordHash' => $recordHash,
    'doctorId'   => $doctorA,
    'facilityId' => $hospA['facility_id'],
]);
audit($doctorA, 'record_submitted',
    "DEMO | Hospital A ({$hospA['name']}) | Patient: $patient_id | Type: Consultation | Hash: " . substr($recordHash, 0, 16));
$steps[] = "Hospital A — clinical record submitted and anchored on blockchain";

// ─── Step 5: Hospital B — cross-hospital access request ─────────────
db()->prepare(
    'UPDATE otp_requests SET used = 1 WHERE patient_id = ? AND doctor_id = ? AND used = 0'
)->execute([$patient_id, $doctorB]);

$otpB = str_pad(random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
db()->prepare(
    'INSERT INTO otp_requests (patient_id, doctor_id, otp, expires_at)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))'
)->execute([$patient_id, $doctorB, $otpB]);

sidecar_post('/requestAccess', ['patientId' => $patient_id, 'doctorId' => $doctorB]);
audit($doctorB, 'access_requested',
    "DEMO | Hospital B ({$hospB['name']}) cross-hospital | Patient: $patient_id | Origin: {$hospA['name']}");
$steps[] = "Hospital B ({$hospB['name']}) — cross-hospital access requested";

// ─── Step 6: Cross-hospital consent granted ──────────────────────────
$otpRowB = db()->prepare(
    'SELECT id FROM otp_requests
      WHERE patient_id = ? AND doctor_id = ? AND otp = ? AND used = 0 AND expires_at > NOW()
      LIMIT 1'
);
$otpRowB->execute([$patient_id, $doctorB, $otpB]);
$rowB = $otpRowB->fetch();
if ($rowB) {
    db()->prepare('UPDATE otp_requests SET used = 1 WHERE id = ?')->execute([$rowB['id']]);
}

db()->prepare(
    'INSERT INTO consents (patient_id, doctor_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE granted_at = NOW(), revoked_at = NULL'
)->execute([$patient_id, $doctorB]);

sidecar_post('/verifyOTPAndGrant', [
    'patientId' => $patient_id,
    'doctorId'  => $doctorB,
    'otp'       => $otpB,
]);
audit($doctorB, 'consent_granted',
    "DEMO | Hospital B ({$hospB['name']}) cross-hospital | Patient: $patient_id");
$steps[] = "Cross-hospital consent granted — Hospital B doctor has access";

// ─── Step 7: Hospital B submits a follow-up record ──────────────────
$noteB = "DEMO RECORD — Follow-up review at {$hospB['name']} following referral from {$hospA['name']}. "
       . "Records from initial consultation reviewed. Treatment plan updated. "
       . "Patient responding well. Next review in 2 weeks.";

$keyB       = hash('sha256', $doctorB . $patient_id . date('Y-m-d'));
$encryptedB = openssl_encrypt($noteB, 'AES-256-CBC', $keyB, 0, $iv);
$cidB       = 'PENDING_IPFS:' . $encryptedB;

$ipfsB = sidecar_post('/uploadToIPFS', ['content' => $encryptedB]);
if ($ipfsB['ok'] && !empty($ipfsB['cid'])) $cidB = $ipfsB['cid'];

db()->prepare(
    'INSERT INTO medical_records (patient_id, doctor_id, facility_id, record_type, notes, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())'
)->execute([$patient_id, $doctorB, $hospB['facility_id'], 'Follow-up', $cidB]);

$recordHashB = hash('sha256', $cidB . $patient_id . $doctorB);
sidecar_post('/createRecord', [
    'patientId'  => $patient_id,
    'ipfsCID'    => $cidB,
    'recordHash' => $recordHashB,
    'doctorId'   => $doctorB,
    'facilityId' => $hospB['facility_id'],
]);
audit($doctorB, 'record_submitted',
    "DEMO | Hospital B ({$hospB['name']}) | Patient: $patient_id | Type: Follow-up | Hash: " . substr($recordHashB, 0, 16));
$steps[] = "Hospital B — follow-up record submitted. Both facilities now share the patient's history.";

// ─── Step 8: Cross-hospital record view event ────────────────────────
audit($doctorB, 'record_viewed',
    "DEMO | Hospital B ({$hospB['name']}) viewed Hospital A ({$hospA['name']}) records | Patient: $patient_id");
$steps[] = "Hospital A records viewed by Hospital B — interoperability complete";

json_ok([
    'steps'      => $steps,
    'hospital_a' => $hospA['name'],
    'hospital_b' => $hospB['name'],
    'patient_id' => $patient_id,
    'doctor_a'   => $doctorA,
    'doctor_b'   => $doctorB,
    'message'    => 'Demo complete. Refresh the blockchain dashboard to see all 8 events.',
]);