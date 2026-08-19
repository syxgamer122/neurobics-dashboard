# Privacy Policy & Terms of Service

**Effective Date:** August 16, 2026
**Data Controller:** MindGem Foundation (privacy@mindgem.org)

This document outlines the privacy practices and terms of service for MindGem.

## Privacy Policy

### 1. Data Collection & Health-Adjacent Data
We collect the following types of information to operate and secure MindGem:
- **Account Data:** Username, email address (including guest proxy emails), and avatar.
- **Cognitive Data:** Game scores, reaction times, and session telemetry used to calculate your Cognitive Index. **Note:** While this data reflects cognitive performance, MindGem treats it as "health-adjacent" sensitive data. It is never sold, shared with advertisers, or used for medical profiling.
- **Demographics:** Birth year (used to contextualize the Cognitive Index / Brain Age).
- **Device Telemetry:** Device fingerprinting and Cloudflare Turnstile tokens, strictly used for anti-cheat verification, rate-limiting, and bot protection. Fingerprints are pseudonymized (keyed HMAC rotated) before storage.

### 2. Lawful Basis & Subprocessors (GDPR Compliance)
- **Lawful Basis:** We process Account Data to fulfill our **Contract** (providing the game service). We process Cognitive Data (Brain Age / Index) based on your **Explicit Consent**, which you may withdraw at any time. Data-Processing Matrix: 
| Mục đích | Dữ liệu | Cơ sở pháp lý | Lưu trữ | Khi rút quyền |
|---|---|---|---|---|
| Chơi game | Điểm số (training_sessions) | Hợp đồng | Vĩnh viễn | N/A |
| Chơi game | Dữ liệu gốc (raw_telemetry) | Lợi ích hợp pháp | 180 ngày | N/A |
| Brain Age | Thống kê | Explicit Consent | Khi rút | Dừng tính |
| Anti-cheat | Tín hiệu | Lợi ích hợp pháp | 90 ngày | Review |

Hệ thống cung cấp bảng `user_consents` và UI Toggle trong Settings. Nếu rút consent, Brain Age sẽ bị ẩn nhưng game vẫn hoạt động. Tính năng Export Data API xuất toàn bộ Manifest: profile, telemetry, tickets, ledgers, consents, avatar metadata, và cheat_flags (đã pseudonymized). thông tin kể cả `practice_sessions` và `cheat_flags`. Security telemetry is processed under **Legitimate Interest** to prevent fraud.
- **Subprocessors:** We use Supabase (Database & Auth), Cloudflare (CDN & Turnstile), and Vercel (Frontend).
- **International Transfer:** Data is hosted in secure datacenters and may be transferred internationally under standard contractual clauses (SCCs) ensuring adequate protection.

### 3. Data Retention & Deletion
- **User Data:** Retained while the account is active. `practice_sessions` and `training_sessions` are kept indefinitely as long as the account exists.
- **Guest Data:** Guest accounts are automatically purged based on the schedule defined in `data-retention.md` (30 days from creation).
- **Security Logs:** `admin_audit` is kept for 365 days; `cheat_flags` and `observability_events` are kept for 90 days (Đồng bộ Data Retention Policy).
- **Outbox/Journals:** `outbox_events` and `account_deletion_operations` are purged 7 days after completion.

### 4. User Rights (Access, Export, Appeal)
You have the right to:
- **Access & Export:** Request a machine-readable JSON export of all your telemetry and scores.
- **Erasure:** Use the in-app "Delete Account" to permanently and irreversibly purge your `profiles`, `auth`, and `storage` data. Exceptions apply for security logs (retained up to 90/365 days) to protect system integrity under Legitimate Interest.
- **Automated Decision-Making & Appeal:** Our anti-cheat system makes automated decisions to restrict capabilities. You have the right to request a manual human review. False positives will be handled via append-only compensation and manual reversal of the flag impact.

### 5. Age Restrictions
MindGem requires users to be at least 16 years old globally. (Hệ thống kiểm tra: UI/Zod validate `birth_date <= currentDate - 16 years`, DB trigger chặn ngày sinh thực tế. Yêu cầu nhập chính xác `birth_date` thay vì chỉ `birth_year`. Các tài khoản cũ chỉ có `birth_year` sẽ tự động áp dụng quy tắc bảo thủ (tính sinh vào ngày 31/12 của năm đó). We do not knowingly collect data from minors under the legal age of consent.

### 6. Thông báo xử lý dữ liệu (Nghị định 13/2023/NĐ-CP)
Theo Nghị định 13/2023/NĐ-CP của pháp luật Việt Nam, chúng tôi thực hiện thông báo cho Người dùng về hoạt động xử lý Dữ liệu cá nhân (từ việc thu thập, lưu trữ, sử dụng và xoá bỏ) như được mô tả chi tiết tại tài liệu này. Khi sử dụng dịch vụ, bạn xác nhận đã đọc, hiểu và đồng ý với các nội dung xử lý dữ liệu này.

---

## Terms of Service

### 1. Acceptable Use
You agree to use MindGem fairly. The following activities are strictly prohibited:
- Using bots, macros, scripts, or any automated tools.
- Attempting to bypass the anti-cheat system or altering the `challenge_config`.
- Reverse-engineering the API to submit fraudulent payloads.

### 2. Fair Play & Anti-Cheat
MindGem utilizes server-authoritative scoring.
- We reserve the right to flag or ban accounts exhibiting mathematically impossible reaction times or cheating patterns.
- If you believe your account was flagged in error, you may appeal. We do not delete the `cheat_flags` record, but we will append a `manual_review` marking it as a false positive and restore any lost capabilities.

### 3. Medical Disclaimer
**MindGem is not a medical device.** The application is for cognitive training and entertainment only. It is not a substitute for professional medical advice, diagnosis, or treatment. The "Cognitive Index" and "Brain Age" metrics are gamified estimates. Always seek the advice of your physician regarding medical conditions.

---
*For privacy inquiries, GDPR requests, or support, please contact privacy@mindgem.org.*
