# sql-chia-nho

Thư mục này từng chứa bản SQL cắt nhỏ để dán tay.

**Không chạy các file ở đây trên production.**

- `phan-3.sql` đã bị vô hiệu hóa cố ý: nếu chạy sẽ `raise exception`.
- Mọi thay đổi schema/RPC hợp lệ chỉ nằm trong `supabase/migrations/`.

Thứ tự migration gần đây (tham khảo):

1. `20260815_persist_decay_and_coverage.sql`
2. `20260816_ticket_ttl_and_personal_bests.sql`
3. `20260817_drop_legacy_overloads.sql`
4. `20260818_pullup_cold_start.sql`
5. `20260819_restore_float8_wrappers.sql`
6. `20260820_security_identity_hardening.sql`
