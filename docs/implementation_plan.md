# Giải quyết triệt để 10 Lỗi Kiến Trúc (AI Review)

Kế hoạch này nhằm mục đích giải quyết 10 vấn đề Major/Critical do AI Review chỉ ra để đạt trạng thái "Production-ready" không còn blocker.

## 1. Offline & Idempotency (Critical)
- **Offline Unranked**: Đặt mặc định Offline Sync là Practice/Unranked (`trust_level = unverified`, `provenance = offline_sync`). Dữ liệu này sẽ KHÔNG cộng vào Global Leaderboard, Competitive Rating (ELO), hay Personal Best. 
- **DB Unique Constraints**:
  - `round_tickets_user_client_round_uq UNIQUE (user_id, client_round_id)`
  - `training_sessions_round_uq UNIQUE (round_id)`
  - `xp_events_round_award_uq UNIQUE (round_id) WHERE event_type = 'round_award'`
- **Transaction & Locking**: Cập nhật RPC `submit_round_transaction` và `submit_offline_round_tx` để dùng `SELECT * FROM round_tickets WHERE id = ... FOR UPDATE` nhằm block các request đồng thời. Bất kỳ request nào sau request đầu tiên sẽ thấy `submitted_at IS NOT NULL` và rollback.

## 2. Admin Atomicity & Stats Generation (Critical)
- **Atomic RPCs**: Chuyển các hàm xử lý grant/reset XP thành một khối duy nhất thực thi trong PostgreSQL thay vì query-then-update trên Edge Function. (Ví dụ: `admin_grant_xp(p_target_id, p_xp_amount)` tự động check user, update profiles, ghi xp_events, ghi admin_audit trong cùng 1 TX).
- **Stats Generation Epoch**: Thêm `stats_generation bigint` vào `profiles` và `xp_events`. Lệnh Reset tài khoản sẽ không xóa/wipe `xp_events` cũ, mà chỉ đơn giản là `stats_generation = stats_generation + 1`. Các query tính level sẽ chỉ sum XP ở `stats_generation` hiện tại (Append-only Ledger).
- **Safe Account Deletion**: Áp dụng mô hình Operation Journal cho luồng xóa tài khoản thay vì cố ép xóa Auth, Storage và DB vào 1 transaction không tưởng.

## 3. RLS Column-level Protection & Auth Roles (Critical)
- Dọn dẹp lại lệnh GRANT/REVOKE trên bảng `profiles`:
  - `REVOKE UPDATE ON TABLE profiles FROM anon, authenticated;`
  - `GRANT UPDATE (username, birth_year, avatar_url, locale) ON TABLE profiles TO authenticated;`
- Bổ sung `SECURITY DEFINER SET search_path = ''` cho TẤT CẢ các RPC và `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC`.

## 4. Tránh lỗi NaN trong Scoring (Major)
- Bổ sung hàm `clamp01(val)` và `assertFiniteScore(val)` trong Edge Functions để chặn hoàn toàn `NaN` và `Infinity` lọt vào DB cho N-Back, Corsi, Sudoku.
- Chuẩn hóa: Structural Validator chỉ kiểm tra range thô, Inspector quyết định flag (nếu RT < 80ms), và Scorer bỏ qua mẫu bất thường để tính điểm.

## 5. Cập nhật Tài liệu & Giám sát (Major)
- **IndexedDB**: Sửa `feature_offline_pwa.txt` để sử dụng IndexedDB + Web Locks API thay cho LocalStorage. (Đã thực hiện cập nhật docs, sẽ thiết kế DB store nếu cần làm UI/Frontend).
- **Version Policy**: Gỡ bỏ hợp đồng "Re-scoring", thay bằng "Never re-score, always use manual_reviews". (Đã thực hiện trong `version-policy.md`). Khai báo `SCORER_VERSIONS` dưới dạng `as const satisfies Record<Game, number>`.
- **MFA ADR-0010**: Bổ sung xác nhận "Giảm đáng kể rủi ro", thêm short-lived step-up session, và liệt kê các `AppErrorStatus`.
- **Giám sát (Observability)**: Sửa lại query tính p95 và Availability trong `observability.md` (dùng `sum(le_100)` thay vì `count_le_100`), đổi logic tính payload size thành `TextEncoder().encode(raw).byteLength`.

## 6. Trạng thái khách (Guest Upgrade Machine) (Major)
- Database Trigger của Guest Upgrade cần kiểm tra: User là ai, `upgrade_operations` thuộc đúng user, chưa từng consumed, và còn hạn sử dụng. Password và revoke session cũ cũng phải được quy định.

## Kế hoạch Thực thi (Verification Plan)
- **DB Migrations**: Tạo một file `20260927160000_phase35_final_ai_review.sql` để áp dụng TẤT CẢ các thay đổi DB (constraints, generation, RLS column-level, atomic RPCs).
- **Deno Edge Functions**: Sửa `_shared/scoring/math.ts` và `admin.ts`.
- **Chạy Tests tĩnh**: `node tests/scan-docs.mjs` và typechecks.
- Đợi User duyệt kế hoạch trước khi ghi mã lệnh.
