<?php
// NotificationService.php — Coordinates email + SMS notifications.
// ─────────────────────────────────────────────────────────────
// RULES:
//   • Email is the primary channel.
//   • SMS is the secondary channel.
//   • Neither channel failing ever blocks a registration or workflow.
//   • OTPs, medical records, diagnoses, and blockchain data are NEVER sent via SMS.
//   • Temporary passwords are only sent via email (not SMS) when email is available.
//     If email is unavailable, the temp password is included in the SMS.
// ─────────────────────────────────────────────────────────────

require_once __DIR__ . '/send_mail.php';
require_once __DIR__ . '/SmsService.php';

class NotificationService {

    private SmsService $sms;

    public function __construct() {
        $this->sms = new SmsService();
    }

    // ─── PATIENT REGISTRATION ────────────────────────────────────────────────
    /**
     * Notify patient after registration.
     * If email is configured: email carries the temp password; SMS is a welcome only.
     * If no email: SMS carries the temp password as well.
     *
     * @param string      $health_id
     * @param string      $full_name
     * @param string|null $email           null if no email provided
     * @param string      $phone
     * @param string      $temp_password
     * @param string      $facility_name   primary hospital
     * @return array{email_sent:bool, sms_sent:bool}
     */
    public function notifyPatientRegistered(
        string $health_id,
        string $full_name,
        ?string $email,
        string $phone,
        string $temp_password,
        string $facility_name
    ): array {
        $email_sent = false;
        $sms_sent   = false;

        // Email (primary — carries temp password)
        if ($email) {
            $email_sent = send_credentials_email($email, $full_name, [
                'role'          => 'Patient',
                'staff_id'      => $health_id,
                'temp_password' => $temp_password,
                'facility_name' => $facility_name,
            ]);
        }

        // SMS (secondary — never contains the temp password if email succeeded)
        if ($phone) {
            if ($email && $email_sent) {
                // Email delivered — SMS is a brief welcome, no credentials
                $sms_msg = "Welcome to HealthShare.\n\nYour account has been created successfully.\n\nHealth ID: {$health_id}\n\nPlease check your email for your temporary password.\n\nPrimary Hospital: {$facility_name}\n\nThank you.";
            } else {
                // No email or email failed — include temp password in SMS
                $sms_msg = "Welcome to HealthShare.\n\nYour account has been created.\n\nHealth ID: {$health_id}\nTemporary Password: {$temp_password}\nPrimary Hospital: {$facility_name}\n\nLog in at the HealthShare portal and change your password on first login.\n\nThank you.";
            }
            $sms_sent = $this->sms->sendIfAvailable($phone, $sms_msg);
        }

        return compact('email_sent', 'sms_sent');
    }

    // ─── STAFF REGISTRATION (doctor / hospital admin / emergency) ────────────
    /**
     * Notify a staff member after registration.
     * Email carries the credentials; SMS is a brief notification.
     */
    public function notifyStaffRegistered(
        string $email,
        string $phone,
        string $full_name,
        array  $creds        // role, staff_id, temp_password, facility_name, (emergency_token)
    ): array {
        $email_sent = send_credentials_email($email, $full_name, $creds);

        $sms_sent = $this->sms->sendIfAvailable($phone,
            "Your HealthShare staff account has been created.\n" .
            "Please check your email for your temporary password.\n" .
            "Facility: " . ($creds['facility_name'] ?? '') . "\n" .
            "— HealthShare System"
        );

        return compact('email_sent', 'sms_sent');
    }

    // ─── PASSWORD RESET ──────────────────────────────────────────────────────
    /**
     * Notify user that their password has been reset.
     */
    public function notifyPasswordReset(?string $phone): bool {
        return $this->sms->sendIfAvailable($phone,
            "Your HealthShare password has been reset successfully.\n" .
            "Please check your email for your temporary password.\n" .
            "— HealthShare System"
        );
    }

    // ─── CONSENT REQUEST ─────────────────────────────────────────────────────
    /**
     * Notify patient that a doctor has requested access to their records.
     */
    public function notifyConsentRequest(
        ?string $patient_phone,
        string  $doctor_name,
        string  $hospital_name
    ): bool {
        return $this->sms->sendIfAvailable($patient_phone,
            "Dr. {$doctor_name} from {$hospital_name} has requested access to your medical records.\n" .
            "Please log in to HealthShare to approve or deny this request.\n" .
            "— HealthShare System"
        );
    }

    // ─── OTP TO PATIENT (sent after patient approves) ───────────────────────
    /**
     * Send the OTP to the patient's phone after they approve a doctor's request.
     * The OTP is ONLY delivered via SMS — never shown on screen, never emailed.
     */
    public function notifyOtpToPatient(
        ?string $patient_phone,
        string  $otp,
        string  $doctor_name
    ): bool {
        return $this->sms->sendIfAvailable($patient_phone,
            "HealthShare\n\n" .
            "You approved Dr. {$doctor_name}'s request.\n\n" .
            "Your verification code is:\n\n" .
            "{$otp}\n\n" .
            "Share this code ONLY with the treating doctor.\n" .
            "This code expires in 5 minutes.\n\n" .
            "— HealthShare System"
        );
    }

    // ─── CONSENT APPROVED ────────────────────────────────────────────────────
    /**
     * Generic consent-approved notification (kept for backward compatibility).
     * For the OTP flow, use notifyOtpToPatient() instead.
     */
    public function notifyConsentApproved(?string $patient_phone): bool {
        return $this->sms->sendIfAvailable($patient_phone,
            "You have successfully approved access to your medical records.\n" .
            "Your verification code has been sent to this phone number.\n" .
            "Share it only with the treating doctor. It expires in 5 minutes.\n" .
            "— HealthShare System"
        );
    }

    // ─── CONSENT DENIED ──────────────────────────────────────────────────────
    /**
     * Notify patient that they have denied access.
     */
    public function notifyConsentDenied(?string $patient_phone): bool {
        return $this->sms->sendIfAvailable($patient_phone,
            "You denied the request to access your medical records.\n" .
            "The request has been logged.\n" .
            "— HealthShare System"
        );
    }

    // ─── EMERGENCY ACCESS ────────────────────────────────────────────────────
    /**
     * Notify patient that emergency access was initiated.
     */
    public function notifyEmergencyAccess(?string $patient_phone): bool {
        return $this->sms->sendIfAvailable($patient_phone,
            "Emergency access to your medical records has been initiated.\n" .
            "This event has been securely logged in our system.\n" .
            "If you did not expect this, contact your primary hospital.\n" .
            "— HealthShare System"
        );
    }
}
