<?php
// mail_config.php — HealthShare email configuration
// ─────────────────────────────────────────────────────────────
// Fill in ONE of the sections below and leave the others blank.
// This file is the single place you change for any email provider.
// Never commit real credentials to git — add mail_config.php to .gitignore.
//
// QUICK GUIDE:
//   XAMPP / local dev with Gmail:
//     1. Enable 2-Step Verification on your Google account.
//     2. Go to myaccount.google.com → Security → App Passwords.
//     3. Generate an App Password (select "Mail" / "Other").
//     4. Paste it in MAIL_PASSWORD below.
//
//   Docker / cloud (port 587 is usually blocked):
//     Option A — Mailtrap (free dev inbox, no real delivery):
//       MAIL_HOST = sandbox.smtp.mailtrap.io
//       MAIL_PORT = 2525     ← Mailtrap uses 2525, which is rarely firewalled
//       MAIL_USERNAME / MAIL_PASSWORD from your Mailtrap inbox credentials
//
//     Option B — Brevo / SendGrid / Mailgun (free tiers, real delivery):
//       Use SMTP relay host they provide; most support port 587 AND 2525.
//       Or use the HTTP API wrapper below.
//
//     Option C — Local MailHog (Docker dev only, no real delivery):
//       MAIL_HOST = mailhog   ← Docker service name
//       MAIL_PORT = 1025
//       MAIL_USERNAME = ''    ← MailHog needs no auth
//       MAIL_PASSWORD = ''
// ─────────────────────────────────────────────────────────────

return [
    // ── SMTP credentials ─────────────────────────────────────
    'host'       => 'smtp.gmail.com',      // SMTP server hostname
    'port'       => 587,                    // 587 = STARTTLS, 465 = SSL, 2525 = Mailtrap
    'username'   => 'mutualee6@gmail.com', // ← your Gmail address (or SMTP username)
    'password'   => 'ilnt twaa rmqr poci',    // ← your Gmail App Password (16 chars, no spaces)
    'encryption' => 'tls',                  // 'tls' for STARTTLS, 'ssl' for SSL, '' for none
    'from_email' => 'mutualee6@gmail.com', // ← same as username for Gmail
    'from_name'  => 'Healthshare',

    // ── Debug mode ────────────────────────────────────────────
    // 0 = silent (production), 2 = full SMTP transcript (development)
    // When debug > 0, SMTP dialogue is written to PHP error_log.
    'debug'      => 0,

    // ── Timeout (seconds) ─────────────────────────────────────
    // Keep low so Docker containers fail fast when SMTP is blocked.
    'timeout'    => 5,
];
