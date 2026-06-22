<?php
// get_notifications.php — notifications for a patient (access events, consents, revocations)
require_once __DIR__ . '/helpers.php';

$patient = require_role('patient');
$pid = $patient['user_id'];

// Boundary-safe match: "Patient: <id>" must be followed by end-of-string,
// a space, or a pipe — never by extra characters that belong to a different
// (longer) Health ID. actor_id = $pid also covers the patient's own actions
// (e.g. otp_denied, consent_revoked, which the patient performs themself).
$stmt = db()->prepare(
    "SELECT action, detail, created_at
     FROM audit_logs
     WHERE (actor_id = ?
            OR detail LIKE CONCAT('%Patient: ', ?)
            OR detail LIKE CONCAT('%Patient: ', ?, ' %')
            OR detail LIKE CONCAT('%Patient: ', ?, '|%'))
       AND action IN ('consent_granted','consent_revoked','breakglass_access','access_requested','otp_denied')
     ORDER BY created_at DESC
     LIMIT 20"
);
$stmt->execute([$pid, $pid, $pid, $pid]);
$logs = $stmt->fetchAll();

$notifications = array_map(function($l) {
    $icons = [
        'consent_granted'   => '✅',
        'consent_revoked'   => '🚫',
        'breakglass_access' => '🚨',
        'access_requested'  => '🔔',
        'otp_denied'        => '❌',
    ];
    $labels = [
        'consent_granted'   => 'A doctor was granted access to your records',
        'consent_revoked'   => 'You revoked a doctor\'s access',
        'breakglass_access' => 'Emergency break-glass access to your records',
        'access_requested'  => 'A doctor requested access to your records',
        'otp_denied'        => 'You denied an access request',
    ];
    return [
        'icon'   => $icons[$l['action']] ?? '•',
        'label'  => $labels[$l['action']] ?? $l['action'],
        'detail' => $l['detail'],
        'time'   => $l['created_at'],
    ];
}, $logs);

json_ok(['notifications' => $notifications]);
