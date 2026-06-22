<?php
// db.php — PDO connection singleton
// Edit $host, $dbname, $user, $pass to match your XAMPP setup.

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $host   = 'localhost';
        $dbname = 'healthshare';
        $user   = 'root';
        $pass   = '';          // XAMPP default; change if you set a root password
        $pdo = new PDO(
            "mysql:host=$host;dbname=$dbname;charset=utf8mb4",
            $user, $pass,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]
        );
    }
    return $pdo;
}
