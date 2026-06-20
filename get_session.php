<?php
// get_session.php — GET → returns current session user or 401
require_once __DIR__ . '/helpers.php';

if (empty($_SESSION['user'])) {
    json_err('Not authenticated', 401);
}
json_ok(['user' => $_SESSION['user']]);
