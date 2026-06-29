<?php
// send_sms.php — Thin compatibility wrapper around SmsService.
// Use NotificationService for all new code.
// This file exists so legacy call-sites (if any) continue to work.
require_once __DIR__ . '/SmsService.php';

function send_sms(string $phone, string $message): bool {
    return (new SmsService())->send($phone, $message);
}
