<?php
// sms_config.php — HealthShare SMS configuration (Ping.Africa)
// ─────────────────────────────────────────────────────────────
// NEVER commit real API tokens to git — add sms_config.php to .gitignore.
//
// CONFIGURATION LOADING ORDER (first match wins):
//   1. Environment variables  SMS_API_KEY / SMS_BASE_URL / SMS_SENDER_ID
//   2. Values below
// ─────────────────────────────────────────────────────────────

function _sms_config(): array {
    $env_key = getenv('SMS_API_KEY');
    if ($env_key !== false && $env_key !== '' && $env_key !== 'PASTE_YOUR_TOKEN_HERE') {
        return [
            'api_key'   => trim($env_key),
            'base_url'  => getenv('SMS_BASE_URL') ?: 'https://api.bulk.ping.africa/api/sms/send',
            'sender_id' => getenv('SMS_SENDER_ID') ?: 'PING-AFRICA',
            'timeout'   => 10,
        ];
    }

    return [
        'api_key'   => '59|gGUOf0ncM6XPePKMyv3804cQrcvpH0sNEexvCiCOf4938c12',
        'base_url'  => 'https://api.bulk.ping.africa/api/sms/send',
        'sender_id' => 'PING-AFRICA',   // default shared shortcode — works without Sender ID registration
        'timeout'   => 10,
    ];
}