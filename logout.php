<?php
// logout.php — POST → destroys session
require_once __DIR__ . '/helpers.php';
session_destroy();
json_ok();
