<?php
// logout.php — POST → deletes this tab's auth token only (other tabs/roles
// logged in in the same browser are unaffected)
require_once __DIR__ . '/helpers.php';

$token = current_token();
if ($token) {
    db()->prepare('DELETE FROM auth_tokens WHERE token = ?')->execute([$token]);
}
json_ok();
