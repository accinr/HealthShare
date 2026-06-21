<?php
// submit_record.php — doctor submits a clinical record
// Flow: encrypt → upload to IPFS → store CID on blockchain → save in MySQL

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/sidecar.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_err('Method not allowed', 405);

$doctor = require_role('doctor');

$body        = json_decode(file_get_contents('php://input'), true) ?? [];
$patient_id  = trim($body['patient_id']  ?? '');
$record_type = trim($body['record_type'] ?? '');
$notes       = trim($body['notes']       ?? '');

if (!$patient_id || !$record_type || !$notes) {
    json_err('Patient ID, record type and notes are required.');
}

// Verify patient exists
$chk = db()->prepare('SELECT user_id FROM patients WHERE user_id = ?');
$chk->execute([$patient_id]);
if (!$chk->fetch()) json_err('Patient not found.');

// Get doctor facility
$fac = db()->prepare('SELECT facility_id FROM doctors WHERE user_id = ?');
$fac->execute([$doctor['user_id']]);
$row = $fac->fetch();
if (!$row) json_err('Doctor facility not found.', 500);
$facility_id = $row['facility_id'];

// Simple encryption using openssl (AES-256)
$encryption_key = hash('sha256', $doctor['user_id'] . $patient_id . date('Y-m-d'));
$iv             = substr(hash('sha256', $patient_id), 0, 16);
$encrypted      = openssl_encrypt($notes, 'AES-256-CBC', $encryption_key, 0, $iv);

if (!$encrypted) json_err('Encryption failed.');

// Upload encrypted content to IPFS via sidecar
$ipfs = sidecar_post('/uploadToIPFS', ['content' => $encrypted]);
if (!$ipfs['ok']) json_err('IPFS upload failed: ' . ($ipfs['error'] ?? 'unknown'));

$cid = $ipfs['cid'];

// Store CID on blockchain
$blockchain = sidecar_post('/createRecord', [
    'patientId'  => $patient_id,
    'ipfsCID'    => $cid,
    'recordType' => $record_type,
    'doctorId'   => $doctor['user_id'],
    'facilityId' => $facility_id,
]);

// Save in MySQL (CID only, not the raw notes)
db()->prepare(
    'INSERT INTO medical_records (patient_id, doctor_id, facility_id, record_type, notes, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())'
)->execute([$patient_id, $doctor['user_id'], $facility_id, $record_type, $cid]);

audit($doctor['user_id'], 'record_submitted', "Patient: $patient_id | Type: $record_type | CID: $cid");

json_ok([
    'cid'        => $cid,
    'record_type' => $record_type,
    'blockchain' => $blockchain['ok'] ?? false,
]);
