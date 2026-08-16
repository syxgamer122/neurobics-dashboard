# Privacy Policy & Terms of Service (Draft)

This document outlines the privacy practices and terms of service for MindGem.

## Privacy Policy

### 1. Data Collection
We collect the following types of information to operate and secure MindGem:
- **Account Data:** Username, email address (including guest proxy emails), and avatar.
- **Cognitive Data:** Game scores, reaction times, and session telemetry used to calculate your Cognitive Index.
- **Demographics:** Birth year (used to contextualize the Cognitive Index / Brain Age).
- **Device Telemetry:** Device fingerprinting and Cloudflare Turnstile tokens, strictly used for anti-cheat verification and bot protection.

### 2. Data Usage
Your data is used exclusively to:
- Provide gameplay functionality and maintain the global leaderboard.
- Enhance the anti-cheat system (analyzing reaction time anomalies).
- Calculate your cognitive profile and progress.

*We do not sell your data to third parties.*

### 3. Data Retention & Deletion
- **Observability & Logs:** System logs, including HTTP requests and anti-cheat evaluations, are retained according to our [Data Retention Policy](data-retention.md).
- **User Data:** Your account and gameplay data are retained as long as your account is active. You may delete your account at any time via the self-serve Delete Account option in your Profile settings, which will irreversibly purge your profile, avatar, and all scores.
- **Security & Audit Logs:** For security, fraud prevention, and legal compliance, administrative audit logs (`admin_audit`) are retained for up to 365 days, and anti-cheat telemetry (`cheat_flags`) for up to 90 days. Upon account deletion, your profile, avatar, and gameplay data are permanently erased. Security logs containing a user identifier are retained for the periods above, then permanently deleted.

### 4. Age Restriction
MindGem is not intended for children under the age of 13. By using our service, you confirm that you are at least 13 years old.

---

## Terms of Service

### 1. Acceptable Use
You agree to use MindGem fairly. The following activities are strictly prohibited:
- Using bots, macros, scripts, or any automated tools to play games or manipulate scores.
- Attempting to bypass or exploit the anti-cheat system.
- Reverse-engineering the API to submit fraudulent `submit-round` payloads.

### 2. Fair Play & Anti-Cheat
MindGem utilizes server-side validation and telemetry analysis to ensure fair play. 
- We reserve the right to flag, shadow-ban, or permanently ban accounts that exhibit mathematically impossible reaction times or cheating patterns.
- If you believe your account was flagged in error (false positive), you may appeal via our support channel.

### 3. Service Availability
MindGem is provided "as is". We reserve the right to disable games, reset leaderboards, or take the service offline for maintenance or in response to critical security events.

### 4. Medical Disclaimer
**MindGem is not a medical device.** The application is designed for cognitive training and entertainment purposes only. It is not intended to be a substitute for professional medical advice, diagnosis, or treatment. The "Cognitive Index" and "Brain Age" metrics are gamified estimates based on reaction times and accuracy; they are not certified diagnostic indicators for dementia, Alzheimer's, or any other neurological condition. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.

---
*For privacy inquiries or support requests, please contact privacy@mindgem.org or use the support form in the app.*
