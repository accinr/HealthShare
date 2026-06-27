<?php
// send_test_email.php — HealthShare email system diagnostic
// ─────────────────────────────────────────────────────────────────────
// HOW TO USE (XAMPP):
//   1. Open phpMyAdmin or a browser tab.
//   2. Visit:  http://localhost/healthshare/send_test_email.php?to=you@example.com
//   3. Read each step — a FAIL tells you exactly where the chain breaks.
//
// HOW TO USE (Docker):
//   docker exec -it <php-container> php /var/www/html/send_test_email.php to=you@example.com
//
// SECURITY: Delete or protect this file after you've confirmed email works.
// ─────────────────────────────────────────────────────────────────────

// Run from CLI as well as browser
$is_cli = PHP_SAPI === 'cli';
$to     = $is_cli
    ? (isset($argv[1]) ? ltrim($argv[1], 'to=') : '')
    : ($_GET['to'] ?? '');

if (!$is_cli) {
    header('Content-Type: text/plain; charset=utf-8');
}

function pass(string $step, string $msg = ''): void {
    echo "  ✓ PASS  $step" . ($msg ? " — $msg" : '') . PHP_EOL;
}
function fail(string $step, string $msg = ''): void {
    echo "  ✗ FAIL  $step" . ($msg ? " — $msg" : '') . PHP_EOL;
}
function section(string $title): void {
    echo PHP_EOL . "══════════════════════════════════════════" . PHP_EOL;
    echo "  $title" . PHP_EOL;
    echo "══════════════════════════════════════════" . PHP_EOL;
}

echo "HealthShare — Email System Diagnostic" . PHP_EOL;
echo "PHP " . PHP_VERSION . " · " . date('Y-m-d H:i:s T') . PHP_EOL;

// ── STEP 1: Composer / autoload ───────────────────────────────────────
section("STEP 1: Composer autoload");
$autoload = __DIR__ . '/vendor/autoload.php';
if (!file_exists($autoload)) {
    fail('vendor/autoload.php exists', 'File not found — run: composer install');
    exit(1);
}
require_once $autoload;
pass('vendor/autoload.php exists');

// ── STEP 2: PHPMailer class ───────────────────────────────────────────
section("STEP 2: PHPMailer availability");
if (!class_exists('PHPMailer\PHPMailer\PHPMailer')) {
    fail('PHPMailer class loaded', 'Run: composer require phpmailer/phpmailer');
    exit(1);
}
pass('PHPMailer class loaded');
$version_file = __DIR__ . '/vendor/phpmailer/phpmailer/VERSION';
$version = file_exists($version_file) ? trim(file_get_contents($version_file)) : 'unknown';
pass('PHPMailer version', $version);

// ── STEP 3: PHP extensions ────────────────────────────────────────────
section("STEP 3: PHP extensions");
foreach (['openssl', 'sockets'] as $ext) {
    if (extension_loaded($ext)) pass("ext/$ext loaded");
    else fail("ext/$ext loaded", "install php-$ext");
}
// mbstring is optional but recommended
if (extension_loaded('mbstring')) pass('ext/mbstring loaded (recommended, not required)');
else echo "  ⚠ WARN  ext/mbstring not loaded — non-ASCII names may mangle\n";

// ── STEP 4: Configuration ─────────────────────────────────────────────
section("STEP 4: Configuration (mail_config.php / env vars)");
require_once __DIR__ . '/send_mail.php';  // loads _mail_config()
$cfg = _mail_config();

echo "  Host      : " . $cfg['host'] . PHP_EOL;
echo "  Port      : " . $cfg['port'] . PHP_EOL;
echo "  Encryption: " . ($cfg['encryption'] ?: '(none)') . PHP_EOL;
echo "  Username  : " . $cfg['username'] . PHP_EOL;
echo "  Password  : " . (strlen($cfg['password']) > 0 ? str_repeat('*', min(strlen($cfg['password']),8)) : '(not set)') . PHP_EOL;
echo "  From      : " . $cfg['from_email'] . PHP_EOL;
echo "  Debug lvl : " . $cfg['debug'] . PHP_EOL;
echo "  Timeout   : " . $cfg['timeout'] . "s" . PHP_EOL;

$creds_ok = !empty($cfg['username']) && !empty($cfg['password'])
    && $cfg['username'] !== 'your_gmail@gmail.com'
    && $cfg['password'] !== 'your_app_password';

if ($creds_ok) {
    pass('Credentials appear configured');
} else {
    fail('Credentials not configured',
        'Edit mail_config.php — set username/password to real SMTP credentials');
    echo PHP_EOL . "  Cannot proceed without valid credentials." . PHP_EOL;
    exit(1);
}

// ── STEP 5: TCP connectivity ──────────────────────────────────────────
section("STEP 5: TCP connectivity to SMTP server");
$probe_timeout = $cfg['timeout'];
$socket = @fsockopen($cfg['host'], $cfg['port'], $errno, $errstr, $probe_timeout);
if ($socket) {
    $banner = @fgets($socket, 256);
    fclose($socket);
    pass('TCP connect to ' . $cfg['host'] . ':' . $cfg['port']);
    if ($banner) pass('SMTP banner received', trim($banner));
} else {
    fail('TCP connect to ' . $cfg['host'] . ':' . $cfg['port'],
        "errno=$errno: $errstr");
    echo PHP_EOL;
    echo "  DIAGNOSIS:" . PHP_EOL;
    if ($errno === 0 || stripos($errstr, 'timed') !== false || stripos($errstr, 'timeout') !== false) {
        echo "  Port {$cfg['port']} is FIREWALLED (connection timed out)." . PHP_EOL;
        echo "  This is the most common failure in Docker/cloud environments." . PHP_EOL;
        echo PHP_EOL;
        echo "  Solutions:" . PHP_EOL;
        echo "  A) Mailtrap (dev, port 2525 — rarely blocked):" . PHP_EOL;
        echo "       host=sandbox.smtp.mailtrap.io port=2525" . PHP_EOL;
        echo "       Get credentials at: https://mailtrap.io" . PHP_EOL;
        echo "  B) MailHog (Docker dev, localhost):" . PHP_EOL;
        echo "       Add 'mailhog' service to docker-compose.yml" . PHP_EOL;
        echo "       host=mailhog port=1025 username= password=" . PHP_EOL;
        echo "       Dashboard: http://localhost:8025" . PHP_EOL;
        echo "  C) Cloud relay (Brevo/Postmark/SendGrid free tier):" . PHP_EOL;
        echo "       Use their SMTP host + port 587; all allow outbound" . PHP_EOL;
    } elseif (stripos($errstr, 'refused') !== false || $errno === 111) {
        echo "  Port {$cfg['port']} is REFUSED — server is down or wrong host." . PHP_EOL;
    } else {
        echo "  Unknown network error — check firewall and hostname." . PHP_EOL;
    }
    exit(1);
}

// ── STEP 6: Send test email ───────────────────────────────────────────
section("STEP 6: Send test email");
if (!$to || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
    echo "  No valid recipient supplied." . PHP_EOL;
    if ($is_cli) echo "  Usage: php send_test_email.php to=you@example.com" . PHP_EOL;
    else         echo "  Usage: send_test_email.php?to=you@example.com" . PHP_EOL;
    echo PHP_EOL . "  Skipping send (all other checks passed)." . PHP_EOL;
    exit(0);
}

echo "  Sending to: $to" . PHP_EOL;

$sent = send_credentials_email($to, 'Test User', [
    'role'          => 'Test Role',
    'staff_id'      => 'KE-TST-0001',
    'temp_password' => 'TestPass@123',
    'facility_name' => 'Test Hospital',
]);

if ($sent) {
    echo PHP_EOL;
    pass('Email sent successfully', "Check $to inbox (and spam folder)");
    echo PHP_EOL . "══════════════════════════════════════════" . PHP_EOL;
    echo "  ALL CHECKS PASSED — email system is working." . PHP_EOL;
    echo "══════════════════════════════════════════" . PHP_EOL . PHP_EOL;
} else {
    fail('Email send failed', 'Check PHP error_log for the PHPMailer error message');
    echo "  Re-run with debug=2 in mail_config.php to see the full SMTP dialogue." . PHP_EOL;
    exit(1);
}
