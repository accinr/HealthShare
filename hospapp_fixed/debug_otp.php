<?php
// debug_otp.php — temporary debug tool: shows all pending OTPs + table status
// DELETE THIS FILE before going to production
require_once __DIR__ . '/helpers.php';

$user = require_role('system_admin');

try {
    $rows = db()->query(
        'SELECT o.*, d.full_name AS doctor_name
         FROM otp_requests o
         LEFT JOIN doctors d ON d.user_id = o.doctor_id
         ORDER BY o.created_at DESC LIMIT 20'
    )->fetchAll();
    json_ok(['table_exists' => true, 'rows' => $rows]);
} catch (Exception $e) {
    json_ok(['table_exists' => false, 'error' => $e->getMessage(),
             'fix' => 'Run this SQL in phpMyAdmin: CREATE TABLE IF NOT EXISTS otp_requests (id INT AUTO_INCREMENT PRIMARY KEY, patient_id VARCHAR(20) NOT NULL, doctor_id VARCHAR(20) NOT NULL, otp VARCHAR(10) NOT NULL, expires_at DATETIME NOT NULL, used TINYINT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_patient_pending (patient_id, used, expires_at));'
    ]);
}
