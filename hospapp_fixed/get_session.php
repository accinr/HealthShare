<?php
// get_session.php — GET → returns current session user (resolved from the
// X-Auth-Token header) or 401
require_once __DIR__ . '/helpers.php';

$user = current_user_from_token();
if (!$user) {
    json_err('Not authenticated', 401);
}
json_ok(['user' => $user]);
