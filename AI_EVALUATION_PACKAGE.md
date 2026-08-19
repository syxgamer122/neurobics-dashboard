# TAI LIEU TONG HOP DONG BO VOI DOCS (CHO AI DANH GIA)

> File nay duoc tong hop truc tiep tu cac file tai lieu trong thu muc docs/ va 43 file migration SQL dang cho day vao Supabase Production.

## 1. BOI CANH DATABASE VA CAC LOI VUA GAP
- Remote Database ban dau duoc tao thu cong tren Supabase SQL Editor.
- Cac migration ban dau da duoc ap dung / danh dau baseline.
- Hien co 43 file migration (tu 20260910000002_public_leaderboard.sql den 20260929000006_phase43_practice_sessions.sql) dang can duoc chay.
- Bang public.profiles tren Database that co cac cot: id, username, avatar_url, role, birth_year, algebraic_logic_score, memory_score, speed_score, focus_score, cfop_spatial_record, total_xp, last_active_date, 12 cot session counters, created_at.
- LUU Y CAC COT KHONG TON TAI TREN PROFILES: level, spatial_score (ten that la cfop_spatial_record), lang, locale.
- Loi vua gap: 20260910000002_public_leaderboard.sql bao loi: column p.level does not exist.

## 2. NGUYEN TAC KIEN TRUC (DOCS/ARCHITECTURE-CONTRACTS.MD)
# System Architecture Contracts

Tài liệu này đóng băng các **Nguyên tắc Kiến trúc (Contracts)** cốt lõi của MindGem. Mọi tính năng phát triển mới BẮT BUỘC phải tuân thủ các contracts này. Các tài liệu tính năng (Feature Docs) chỉ đóng vai trò mô tả chi tiết cách triển khai các contracts này.

## 1. Auth & Guest Contract
- **Không tồn tại khái niệm "Local-only Guest"**: Mọi thao tác lưu trữ tiến trình bắt buộc phải gắn với một `auth.users` hợp lệ trên Supabase.
- **Fake Email Auth**: Người dùng "Chơi ngay" (Guest) sẽ được cấp một tài khoản Auth thực sự thông qua cơ chế tự động sinh Fake Email (ADR-0007).
- **Lợi ích**: Đảm bảo 100% dữ liệu tuân thủ Row Level Security (RLS) của Database mà không cần đục lỗ bảo mật cho Guest.

## 2. Offline & Scoring Contract
- **Server is Authoritative**: Máy chủ (Edge Functions) là nơi duy nhất có thẩm quyền chấm điểm (Rating, XP) thông qua dữ liệu Telemetry thô (ADR-0002).
- **Zod Schema Validation**: Dữ liệu Telemetry từ client phải đi qua bộ lọc Zod chặt chẽ trước khi tính toán để chặn rác và injection.
- **Provisional Local Result**: Khi thiết bị mất mạng, Client sẽ sử dụng bộ chấm điểm nội bộ để hiển thị điểm tạm thời (**Provisional/Non-authoritative Result**) nhằm đảm bảo trải nghiệm người dùng không bị gián đoạn.
- **Strict Offline Sync**: Khi thiết bị có mạng trở lại, Client đóng gói Telemetry gửi lên Server. Server sẽ thẩm định và **ghi đè** kết quả Provisional bằng kết quả thật (ADR-0005).
- **Never Re-score**: Tuyệt đối không thay đổi điểm của các ván đã lưu khi thuật toán mới ra mắt để bảo toàn Leaderboard. Mọi xử lý khiếu nại cờ phạt (Anti-cheat) phải thông qua bảng `manual_reviews` để cấp bù XP (`compensation_xp`).

## 3. Observability Contract
- **Telemetry Schema Canonical**: 
  - Toàn bộ HTTP Request gọi vào Server đều phải phát ra sự kiện `http.request`.
  - Từ chối sử dụng các tên gọi khác (như `server.request`, `api.request`).
  - Các trường bắt buộc: `duration_ms` (số nguyên, millisecond), `status_code`, `path`.
- **Log Persistence**: Để tính success rate và giám sát, mọi request đều được ghi nhận lightweight metric qua `recordHttpMetric`. Chỉ các sự kiện lỗi (status 5xx, 422, 429) hoặc sự kiện nghiệp vụ quan trọng mới được `_shared/observability.ts` ghi chi tiết vào bảng `public.observability_events`.
- **Metric Aggregation**: Để phục vụ truy vấn tốc độ cao cho Dashboard, hàm RPC `record_http_metric` tự động nhóm dữ liệu vào các bucket (theo phút và độ trễ) trong bảng `http_metrics_minute`.
- **Dashboard Mapping**: Mọi câu query về lưu lượng hoặc độ trễ trong Operations Dashboard BẮT BUỘC phải query dựa trên bảng gộp `http_metrics_minute` thông qua endpoint `/server/admin-metrics`.

## 4. CI / Validation Contract
- **Quy tắc chặn Merge**: Mọi Pull Request phải vượt qua 2 GitHub Checks bắt buộc:
  - `quality`: Xác thực tĩnh (Typecheck, Lint, Bundle Budget), Unit Tests, và Integration (Migration Apply Smoke, Playwright E2E).
  - `edge-functions`: Xác thực Typecheck trên môi trường Deno cho các API Server.
- CI là lớp phòng thủ cuối cùng. Vercel deployment chỉ được thực thi sau khi CI Passed.

## 5. Admin Authorization Contract
- **Capability-based Gatekeeping**: Giao diện Admin và các Endpoint được bảo vệ bằng mảng quyền hạn `admin_capabilities` (ví dụ: `['read', 'grant', 'reset', 'delete']`) kiểm tra trực tiếp qua hàm `requireAdmin(c, capability)`, thay vì chỉ gộp chung một `role === 'admin'` lỏng lẻo.
- **Append-Only Audit Trail**: Mọi hành động điều chỉnh điểm số (Grant/Reset) hay xóa tài khoản của Admin ĐỀU PHẢI được ghi lại vào bảng `admin_audit` (ADR-0006).
- **No Mutation allowed**: Row Level Security (RLS) của `admin_audit` cấm tuyệt đối thao tác `UPDATE` và `DELETE` (Ngoại lệ: hàm `pseudonymize_audit_subject()` được phép UPDATE để gán user_id = NULL phục vụ erasure)., đảm bảo lịch sử lạm quyền (nếu có) không thể bị xóa bỏ bởi chính Admin.
- **MFA Required (ADR-0010)**: Bất kỳ Endpoint Admin nào cũng bắt buộc kiểm tra `aal === 'aal2'` trong JWT Token (và thời gian verify gần nhất dưới 5 phút) để đảm bảo tính an toàn chống lộ lọt cookie/token.

## 6. Performance & Recovery
- **Pre-mint Ticket Pool (ADR-0008)**: Tránh phát sinh tải (cold-start) trong quá trình INSERT khi người dùng ấn "Start Round", hệ thống sử dụng một `ticket_pool` rỗng. Khi claim, hệ thống dùng `FOR UPDATE SKIP LOCKED` để cấp phát vé siêu tốc (chỉ 15ms). Pool chỉ chứa vé rảnh rỗi, KHÔNG CHỨA version ở thời điểm pre-mint. Trong 1 transaction duy nhất gọi `/server/activate-round`: claim vé, resolve toàn bộ `RoundEngineManifest`, snapshot config, và lưu vào DB.
- **Rolling Deployment Fail-Closed**: Quá trình `resolveScorer()` ném lỗi `UnsupportedEngineVersionError` sẽ buộc vé chuyển sang trạng thái failed, phát metric `engine.unsupported_version`, không crash backend.
- **Guest Account Recovery (ADR-0009)**: Guest "nâng cấp" thành User (SSOT: ADR-0009, cấm dùng update_my_email trực tiếp) thông qua cơ chế **State Machine 6 bước** tại endpoint `/server/upgrade-account`. Trạng thái chờ email sẽ lưu ở `upgrade_operations`, và quyền truy cập thực sự chỉ được cấp phát bằng RPC `finalize_guest_upgrade_tx` sau khi xác thực email thành công. Việc client tự ý gọi `update_my_email()` bị cấm hoàn toàn.


## 3. CAC QUYET DINH KIEN TRUC (DOCS/ADR)
### 0001-fake-email-auth.md

# ADR 0001: Fake Email Authentication (Guest Mode)

## Status
Superseded by [ADR 0007](0007-guest-server-side.md)

## Context
MindGem cần một cách để người dùng trải nghiệm ngay lập tức (Guest Mode) mà không cần đăng ký rườm rà. Tuy nhiên, hệ thống Supabase sử dụng Row Level Security (RLS) gắn liền với hàm `auth.uid()`, đòi hỏi mọi request sửa đổi dữ liệu (insert/update) phải thuộc về một User được xác thực bởi Supabase Auth.

## Decision
Chúng ta quyết định tạo ra một luồng "Fake Email" ẩn dưới màn hình "Guest Mode".
Khi user bấm "Chơi ngay" (Guest), client sẽ tự động sinh ra một email ảo (ví dụ: `guest-uuid@neurobics.local`) và đăng ký nó với Supabase Auth bằng một mật khẩu ngẫu nhiên. Mật khẩu này được lưu trong LocalStorage.
Về phía backend, hệ thống coi đây là một user hoàn toàn hợp lệ, nhưng trường `role` trong bảng `profiles` sẽ được đánh dấu là `guest`.

## Consequences
- **Điểm lợi**: Giữ nguyên kiến trúc RLS. Backend không cần viết thêm các ngoại lệ (bypass) bảo mật cho Guest. Khi Guest muốn nâng cấp thành tài khoản thật, chỉ cần Update Email và Password.
- **Điểm bất lợi**: Gây "rác" database auth nếu Guest không quay lại. (Đã khắc phục bằng Data Retention Policy xóa guest bỏ hoang).


---

### 0002-server-only-scoring.md

# ADR 0002: Server-Only Scoring

## Status
Accepted

## Context
Trong game phát triển bằng web technologies (HTML/JS), dữ liệu trên client rất dễ bị can thiệp. Nếu để Frontend tự tính điểm (XP, Ratings, Cấp độ) rồi gửi lên Server, cheater có thể dễ dàng sửa API payload để hack vị trí Leaderboard.

## Decision
Áp dụng nguyên tắc "Server-Only Scoring". 
Client chỉ đóng vai trò thu thập "Telemetry thô" (như lịch sử click, mảng `rts` - reaction times, số lần nhấp sai). Gói dữ liệu thô này được gửi lên Supabase Edge Function (`/server/submit-round`). Tại đây, Server sẽ:
1. Validate format của Telemetry.
2. Chạy qua hệ thống Anti-cheat (Inspector).
3. Tính toán điểm số cuối cùng (Rating) và điểm kinh nghiệm (XP).
4. Ghi trực tiếp vào Database bằng một Transaction.

## Consequences
- **Điểm lợi**: Chống gian lận giảm thiểu tối đa ở tầng logic. Client không bao giờ quyết định điểm số của mình.
- **Điểm bất lợi**: Khó khăn hơn khi chơi Offline vì client không thể biết điểm thật của mình cho đến khi có mạng trở lại. (Client sẽ sử dụng logic cục bộ để tính toán một kết quả "Provisional / Non-authoritative" tạm thời, sau đó Server sẽ ghi đè kết quả thật khi mạng được kết nối lại).


---

### 0003-typed-registry.md

# ADR 0003: Typed Registry

## Status
Accepted

## Context
Với 12 minigames khác nhau, việc quản lý ID của game (ví dụ: `schulte`, `sudoku`), tên hiển thị, icon, luật chơi ở khắp các nơi (frontend router, SQL constraints, enum, UI components) rất dễ xảy ra lỗi typo hoặc thiếu đồng bộ (thêm game trên UI nhưng quên thêm vào SQL).

## Decision
Sử dụng `GAME_REGISTRY` làm Single Source of Truth (SSOT).
Tất cả 12 games được định nghĩa chung trong file `game-registry.ts`. TypeScript sẽ dùng file này để suy luận ra (infer) type `GameId`.
Ở phía Server và Database (Migration SQL), chúng ta vẫn phải định nghĩa cứng (hardcode constraint `CHECK (game IN (...))`) nhưng các unit test sẽ trích xuất ID từ Registry và so sánh chéo với Database Schema để đảm bảo chúng luôn khớp (Registry Parity).

## Consequences
- **Điểm lợi**: type-safety mạnh mẽ trên toàn bộ Frontend và Backend (Edge Functions). Khi thêm game mới, chỉ cần khai báo vào Registry là TypeScript sẽ báo lỗi ở những nơi chưa handle game mới.
- **Điểm bất lợi**: Cần có công cụ (CI/test) để tự động hóa việc check parity giữa Registry (TS) và Schema (SQL).


---

### 0004-manual-migration-rollback.md

# ADR 0004: Manual Migration Rollback (Roll-forward Only)

## Status
Accepted

## Context
Nhiều framework quản lý database (như Prisma, Sequelize) cung cấp sẵn script `up` và `down` để tự động khôi phục DB về trạng thái trước đó. Tuy nhiên, với Supabase (sử dụng DDL SQL thuần), việc viết lệnh `down` thường phức tạp và rủi ro.

## Decision
Chúng ta quyết định không viết các lệnh rollback (down script) cho migration. Nếu một migration đã được push lên Production và gây lỗi, quy trình xử lý sẽ là "Roll-forward": Viết một file migration mới sửa lỗi đó, thay vì cố gắng rollback về file cũ.

## Consequences
- **Điểm lợi**: Tránh mất dữ liệu vô tình (DROP TABLE, DROP COLUMN) khi rollback tự động. Đơn giản hóa quá trình phát triển (chỉ viết tiến, không viết lùi).
- **Điểm bất lợi**: Khi lỗi xảy ra, developer phải mất thời gian viết migration mới thay vì ấn 1 nút để quay lại bản cũ. Bù lại, sự an toàn của dữ liệu người dùng được đặt lên cao nhất.


---

### 0005-strict-offline-sync.md

# ADR 0005: Strict Offline Sync (Practice-Only)

## Status
Accepted (Cập nhật sau đánh giá kiến trúc Tuần 4)

## Context
MindGem cho phép người chơi tiếp tục chơi khi rớt mạng qua PWA, tạo ra các ván chơi Offline. Khi có mạng trở lại, ứng dụng phải gửi (sync) các ván này lên server. Tuy nhiên, môi trường offline tạo ra lỗ hổng kiến trúc không thể vá: Server không thể xác nhận tính xác thực của `startedAt`, thời gian chơi, hoặc liệu ván chơi đó có phải do bot tự sinh ở client hay không.

## Decision
Đồng bộ Offline sẽ được gắn nhãn `provenance = 'offline_sync'` và chỉ đóng vai trò **Practice (Unranked)**:
1. Dữ liệu nộp lên từ queue offline chỉ mang tính chất thống kê, lịch sử, và cấp lượng XP khuyến khích (Engagement XP) bị giới hạn.
2. Tuyệt đối KHÔNG DÙNG dữ liệu offline để tính toán hoặc ảnh hưởng tới: Global Leaderboard, Competitive Rating (ELO), Personal Best cạnh tranh, Brain Age, hoặc các Achievement dựa trên điểm cao.
3. Vẫn yêu cầu `clientRoundId` để chống nộp trùng (Idempotency).
4. Vẫn thẩm định `zod` schema để tránh lưu rác.
5. Khi người dùng đang Offline, Client hiển thị điểm Provisional (Tạm tính) kèm biểu tượng "Unranked/Practice". Khi có mạng, Server ghi đè bằng kết quả cuối cùng với trust_level = unverified.

## Consequences
- **Điểm lợi**: Khắc phục triệt để lỗ hổng gian lận dữ liệu cạnh tranh từ Offline. Leaderboard và Brain Age luôn chuẩn xác.
- **Điểm bất lợi**: Người chơi ở vùng sóng yếu sẽ không thể leo rank cạnh tranh. Họ chỉ có thể kiếm XP cày cuốc cơ bản để giữ daily streak.


---

### 0006-append-only-audit-log.md

# ADR 0006: Append-Only Admin Audit

## Status
Accepted

## Context
Trong hệ thống MindGem, Admin (God Mode) có quyền cộng/trừ XP, mở khóa Game và thay đổi User Data. Rủi ro về "Rogue Admin" (Admin nội bộ lạm quyền hoặc tài khoản Admin bị hack) là rất lớn.

## Decision
Sử dụng thiết kế Append-Only (Chỉ thêm mới) cho bảng `admin_audit`.
Tất cả các API dành cho Admin đều bắt buộc phải ghi 1 dòng log xuống bảng `admin_audit`. Đồng thời, RLS Policy của Postgres chặn hoàn toàn quyền `UPDATE` và `DELETE` trên bảng này đối với tất cả mọi role (kể cả postgres superuser trên API).

## Consequences
- **Điểm lợi**: Bất kỳ thao tác Admin nào cũng để lại dấu vết trong thời gian retention (Audit Trail). Nếu Admin lạm quyền, họ không thể tự xóa log của chính mình.
- **Điểm bất lợi**: Bảng sẽ to dần theo thời gian. Đã khắc phục bằng Data Retention Policy (xóa log cũ sau 365 ngày thông qua background cron, chứ không dùng quyền API).

## Ngoại lệ
Ngoại lệ duy nhất: hàm prune_admin_audit() chạy SECURITY DEFINER dưới owner bảng, không nhận tham số, chỉ được DELETE WHERE created_at < now() - interval '365 days'. pg_cron gọi hàm này, không gọi DELETE trực tiếp. Mỗi lần chạy ghi lại một dòng vào chính admin_audit (số dòng đã xóa, khoảng thời gian).


---

### 0007-guest-server-side.md

# ADR 0007: Guest Server-Side Provisioning

**Status**: Accepted (Supersedes ADR 0001)

## Context
In ADR 0001, we implemented a client-side fake-email generator that stored a random password in IndexedDB. This "Guest Local" mode allowed users to play immediately without signing up, computing scores entirely in the browser. 

However, this architecture caused several issues:
1. **Security/Abuse**: The `/server/submit-round` endpoint had to conditionally bypass JWT validation for guest IDs, making it an open door for spoofing.
2. **Duplicate Logic**: We had to maintain duplicate scoring algorithms in `src/app/lib/guest.ts` and `supabase/functions/server/routes/scoring.ts`.
3. **Complexity**: Transitioning a "Guest Local" to a full account required migrating local data to the server, resolving conflicts, and replaying telemetry.

## Decision
We decided to adopt a **True Auth Server-Side Provisioning** model for guests:
- Guests are now provisioned by calling `/server/signup` with an empty payload. 
- The Edge Function generates a secure random UUID-based email and strong password.
- The signup request is protected by Cloudflare Turnstile to prevent bot abuse.
- The guest logs in through the standard Supabase Auth flow, receiving a standard JWT.
- A `role` column in `profiles` is set to `'guest'`.
- Guest plays are routed through the exact same `/server/submit-round` endpoint as authenticated users.

## Consequences
- **Positive**: Removed all client-side scoring logic (`guest.ts`). 
- **Positive**: Closed the unauthenticated endpoint loophole; all requests now require a valid JWT.
- **Positive**: Transitioning to a real account only requires an `UPDATE profiles SET role = 'user'` (plus changing the email/password via Supabase Auth), rather than migrating data.
- **Negative**: Guests must be online to initiate their first session (to get the JWT). 


---

### 0008-premint-ticket-pool.md

# ADR-0008: Pre-mint Ticket Pool cho Game Rounds

## Trạng thái
Accepted

## Bối cảnh
Khi người dùng bắt đầu ván chơi (`POST /server/start-round`), Edge Function sẽ gọi `insert` vào bảng `round_tickets` để sinh vé và tạo `started_at` nhằm làm căn cứ đo lường thời gian chơi chính xác (server-authoritative). Tuy nhiên, thao tác `insert` đồng thời tạo ra độ trễ (cold-start) khá lớn tại Edge Function (khoảng 120ms). 

## Giải pháp
Sử dụng một cơ chế cấp phát vé thay vì tạo mới trực tiếp lúc runtime:
- Bảng `ticket_pool` lưu sẵn các vé (được tạo trước).
- Một RPC `start_round_with_pool` sẽ sử dụng kỹ thuật `FOR UPDATE SKIP LOCKED` của Postgres để lấy vé nhàn rỗi (idle) một cách tức thời, gán `user_id`, `game`, và ghi lại `started_at` = `now()`.

## Hệ quả
- **Tích cực**: Độ trễ khởi tạo ván chơi giảm xuống dưới 15ms. Tránh tình trạng tranh chấp (race condition) và block ở DB.
- **Dự phòng (Fallback)**: Nếu `ticket_pool` cạn kiệt, hàm DB sẽ tự động degrade: sinh vé mới (INSERT on the fly) với độ trễ ~120ms và trả về bình thường (chậm 120ms còn hơn báo lỗi 503 cho người dùng). Lỗi `pool.exhausted_fallback` sẽ được log để cảnh báo (P2). Cron job `fill_ticket_pool` chạy mỗi phút để duy trì đủ số vé (cụ thể: `idle >= 10 × peak_starts_per_minute`).
- **Tiêu cực / Cảnh báo**: Chỉ áp dụng cho các ván chơi **Online**. Ván chơi **Offline** vẫn bắt buộc phải để Client khai báo `startedAt` khi đẩy lên Server, vì Client không thể với tới `ticket_pool` lúc đang mất mạng.


---

### 0009-guest-account-upgrade.md

# ADR-0009: Guest Account Upgrade Strategy

## Trạng thái (Status)
Accepted (2026-08-16)

## Bối cảnh (Context)
Người dùng Guest muốn giữ lại dữ liệu khi đổi thiết bị. Trước đây có tài liệu gợi ý chỉ cần gọi `supabase.auth.updateUser` từ client. Tuy nhiên, việc client tự cập nhật không thể thay đổi an toàn trường `role` trong bảng `profiles` (bởi quyền UPDATE trên profiles đã bị khóa). Ngoài ra, nếu cho phép tự do gọi `updateUser`, kẻ tấn công có thể lợi dụng để leo thang đặc quyền.

## Giải pháp (State Machine)
Sử dụng endpoint đặc quyền trên server: `/server/upgrade-account` kết hợp với hệ thống **State Machine** lưu trong bảng `upgrade_operations`.

Quá trình thăng cấp diễn ra theo 5 bước (State Machine):
1. **pending_verification**: Guest gọi API `/server/upgrade-account` với email thực. Hệ thống sinh một `upgrade_operations` cho user với trạng thái pending, rồi gọi Supabase Auth gửi OTP.
2. **email_verified**: User nhập OTP thành công trên Supabase Auth.
3. **credentials_bound**: Server thiết lập mật khẩu mới do người dùng cung cấp.
4. **old_sessions_revoked**: Revoke toàn bộ JWT / session cũ của guest proxy để chống rò rỉ.
Trigger email chỉ chuyển `pending_verification -> email_verified`.
5. **completed**: Quá trình promote thực sự dùng duy nhất RPC `finalize_guest_upgrade_tx` (chỉ chạy sau khi `old_sessions_revoked` -> khóa upgrade_operation -> xác minh `target_email` & `expired/consumed` -> update `role = user` -> update operation = `completed` -> lưu `upgraded_at` -> commit).
   Sau hoàn tất: Yêu cầu đăng nhập lại. Các endpoint nhạy cảm từ chối token có `iat < upgraded_at`. Email thay đổi KHÔNG BAO GIỜ tự động thăng cấp role. Việc thăng cấp chỉ diễn ra qua RPC `finalize_guest_upgrade_tx` có khóa `FOR UPDATE` và đối chiếu session.

Yêu cầu CSDL:
```sql
CREATE UNIQUE INDEX one_live_upgrade_per_user ON public.upgrade_operations (user_id) 
WHERE state IN ('pending_verification', 'email_verified', 'credentials_bound', 'old_sessions_revoked');
```

Các trạng thái lỗi của operation:
- `expired`: Operation quá hạn.
- `failed`: Lỗi hệ thống hoặc sai mật khẩu.
- `cancelled`: Bị thay thế bằng operation mới.

Mỗi transition cần kiểm tra:
- Operation thuộc đúng user.
- User hiện vẫn là guest.
- Email mới khớp với `target_email` của operation.
- Operation chưa hết hạn và chưa bị consumed.
- Chỉ có tối đa một operation pending trên mỗi user (unique constraint).
- Replay attack được xử lý bằng kết quả idempotent.

## Hệ quả (Consequences)
- Dữ liệu hoàn toàn được giữ nguyên và UUID của tài khoản không đổi.
- Quy trình đảm bảo bảo mật cao, chống session hijacking.


---

### 0010-admin-mfa.md

# ADR-0010: Bắt buộc xác thực đa yếu tố (MFA) cho Admin Endpoints

## Trạng thái
Accepted

## Bối cảnh
Mọi thao tác thay đổi điểm (Grant), xóa tài khoản (Delete), reset (Reset) đều rất nhạy cảm. Nếu quản trị viên bị lộ session cookie hoặc bị đánh cắp máy tính khi đang mở tab, toàn bộ hệ thống MindGem sẽ bị đe dọa.

## Giải pháp
- Tích hợp hàm `requireAdmin` để Verify signature bằng JWKS -> verify issuer/audience/expiry/subject -> require aal2 -> require capability -> require step-up grant ≤5 phút. Sử dụng `jose.jwtVerify`, không dùng parser tương đương. 
- Khóa toàn bộ các Admin endpoint nếu `aal === 'aal1'` (nghĩa là chỉ đăng nhập bằng password). Trả về mã lỗi `AppErrorStatus` đặc thù để Client hiển thị UI yêu cầu nhập TOTP (Step-up Authentication).
- Sử dụng Short-lived Step-up Session: Dùng grant riêng trên bảng `admin_step_up_grants` (`user_id`, `session_id`, `verified_at`, `expires_at`, `nonce_hash`, `consumed_at`). Lệnh read có thể dùng grant tái sử dụng trong 5 phút. Lệnh grant/reset yêu cầu recent step-up bắt buộc. Lệnh delete sử dụng one-time grant.
- Ghi nhận `admin_audit` cho mọi thao tác này để truy vết.

## Hệ quả
- Gây bất tiện nhẹ cho đội ngũ vận hành vì mỗi phiên làm việc phải xác thực điện thoại/TOTP.
- hạn chế rủi ro do đánh cắp JWT hay Session Hijacking tĩnh.
- Cần có `AppErrorStatus` rõ ràng để client tự động xử lý chuyển hướng.


## 4. TECH DEBT VA KNOWN ISSUES (DOCS/KNOWN-ISSUES.MD)
# Known Issues & Tech Debt

This file is the single source of truth for all known issues and tech debt across the system.

| ID | Severity | Status | Description | Feature |
|---|---|---|---|---|
| KI-1 | P0 | Fixed in Phase 8 | Offline queue chưa gắn userId. Đã xử lý ở Phase 8 bằng cách gắn userId vào offline queue. | feature_offline_pwa.txt |
| KI-2 | P0 | Fixed in Phase 9 | PushOfflineRound client-side validation chưa chặt (cần trần ngày / sync offline limit). Đã chốt API rate limit. | feature_offline_pwa.txt |
| KI-3 | P0 | Fixed in Phase 8 | total_xp có 4 writer không chống lost-update. Đã dùng ledger-based xp_events trong Phase 8. | feature_games_scoring.txt |
| KI-4 | P0 | Fixed in Phase 8 | RLS bị bypass trên bảng profiles. Đã siết lại RLS + Public Leaderboard view. | feature_auth_profile.txt |
| KI-5 | P0 | Fixed in Phase 8 | Thiếu alert engine giám sát latency/pool. Đã triển khai alert-engine function. | feature_observability.txt |
| KI-6 | P0 | Fixed in Phase 8 | Guest bị dọn nhầm khi total_xp = 0. Đã đổi thành kiểm tra NOT EXISTS training_sessions. | data-retention.md |
| KI-7 | P1 | Fixed in Phase 9 | ticket_pool chưa có job reclaim vé quá hạn lâu (3h+). Đã có cronjob dọn vé kẹt. | feature_games_scoring.txt |
| KI-8 | P1 | Fixed in Phase 13 | Bảng quest bị gọi sai (quest_claims vs user_quests) có thể gây lỗi. | feature_gamification.txt |
| KI-9 | P1 | Fixed in Phase 8 | Admin Reset vẫn tự hoàn nguyên. Đã thêm stats_generation để chống reset hoàn nguyên. | feature_admin.txt |
| KI-10 | P1 | Fixed in Phase 8 | Redaction UUID xoá luôn request_id/session_id. Đã whitelist. | feature_observability.txt |
| KI-11 | P2 | Fixed in Phase 13 | Bắt oan Anti-cheat (False Positives): `inspectMemory` chia cho level thay vì taps. `inspectReaction` bấm non 1 lần bị block. | feature_games_scoring.txt |
| KI-12 | P2 | Fixed in Phase 13 | `decayRating` trong `scoring.ts` chưa lưu đỉnh thực tế, dễ gây xói mòn về 0 thay vì giữ sàn 35% đỉnh. | feature_games_scoring.txt |
| KI-13 | P2 | Fixed in Phase 8 | Database Performance: Cần lưu latency histogram thật thay vì average. | feature_observability.txt |
| KI-14 | P2 | Fixed in Phase 14 | Chấm điểm provisional offline làm lộ hằng số anticheat ra bundle client. Nên giấu hoặc bỏ số provisional khi offline. | feature_games_scoring.txt |
| KI-15 | P3 | Fixed in Phase 15 | E2E Offline Sync Testing: Đã có Playwright test mô phỏng ngắt mạng và verify sync. | CI/CD |
| KI-16 | P3 | Open | Dynamic Feature Flags Admin UI: Cần UI Admin bật/tắt `feature_flags`. | feature_admin.txt |
| KI-17 | P3 | Closed | Đã thêm Focus trap, aria-modal, prefers-reduced-motion và Playwright/axe test. | A11y: Thiếu prefers-reduced-motion và focus-trap cho các màn overlay/glassmorphism. | accessibility.md |
| KI-18 | P3 | Fixed in Phase 15 | Brain Age đang so sánh toàn cục, thiếu phân tầng độ tuổi. | feature_games_scoring.txt |
| KI-19 | P3 | Fixed in Phase 9 | Độ phân giải reject rate bị sai lệch khi xoá row. Đã đếm theo count(DISTINCT round_id) và có review_status. | feature_observability.txt |
| KI-20 | P1 | Closed | Backup Restore Drill hoàn tất. Đã kiểm thử phục hồi toàn diện: DB, Auth users/session, Storage, RLS/policies, Edge Functions, pg_cron, Vault/config, Upgrade operations, Outbox, và DNS/application switch. Đạt chỉ tiêu RPO < 24h và RTO < 4h. | runbook.md |


## 5. QUY TAC MIGRATION (DOCS/MIGRATIONS.MD)
# Migration tu dong

Truoc: moi thay doi schema duoc dan tay vao SQL Editor. Khong ai biet production
dang o phien ban nao, khong the tai lap moi truong, va mot cu dan sai la khong co
duong lui.

Sau: `supabase/migrations/` la nguon su that duy nhat. CI ap dung file, con
`pnpm run db:lint` chan cac loi kinh dien truoc khi chung cham vao database.

---

## 1. Van de phai xu ly mot lan duy nhat: baseline

Database that duoc dung tay, nen bang so `supabase_migrations.schema_migrations`
cua no rong hoac thieu. Neu chay `supabase db push` ngay luc nay, CLI coi ca 35
file la "chua ap dung" va chay lai tu dau. Trong so do co `drop column`,
`delete from`, `drop policy` => **mat du lieu that**.

Baseline la thao tac ghi vao so: "35 version nay coi nhu da ap dung roi".

```powershell
# 1. Chuan hoa ten file trung version (3 file 20260730_*)
node tools/normalize-migrations.mjs            # chi in ke hoach
node tools/normalize-migrations.mjs --apply    # doi ten that

# 2. Sinh danh sach version + cau SQL chot moc
pnpm run db:baseline
```

`db:baseline` tao 2 file:

| File | Vai tro |
| --- | --- |
| `supabase/baseline/applied-versions.txt` | `db:lint` doc de biet migration nao da ap dung |
| `supabase/baseline/mark-existing-as-applied.sql` | Dan **mot lan** vao SQL Editor cua production |

Cau SQL do chi `insert ... on conflict do nothing` vao bang so — khong sua bang
du lieu nao. Sau khi chay, kiem tra:

```powershell
pnpm run db:status     # supabase migration list --linked
```

Cot Local va Remote phai khop het. Neu Local va Remote khong khop, DUNG deploy. Khong chay `db push`. Khoi phuc mot ban sao production (restore) sang moi truong co lap, so sanh schema va xac minh tung migration truoc khi danh dau applied. Tuyet doi khong dung "migration truoc, server sau" neu co the mat du lieu; dung chien luoc expand-contract (them truoc, backfill, sau do moi drop).

---

## 2. Nhip lam viec hang ngay

```powershell
# Tao migration moi (timestamp 14 chu so, ten snake_case)
# vd: supabase/migrations/20260905120000_add_streak_bonus.sql

pnpm run db:lint     # kiem tra truoc khi commit
git add supabase/migrations && git commit -m "db: add streak bonus" && git push
```

Roi vao **Actions > Deploy Supabase > Run workflow**:

1. Lan dau: giu o `dry run` da tich — chi in ra migration se chay.
2. Doc log. Neu dung nhu mong doi, chay lai va **bo tich** `dry run`.
3. Khi da tin tuong, bo comment khoi `push:` trong
   `.github/workflows/deploy-supabase.yml` de deploy tu dong theo moi commit.

Workflow can 3 secrets trong **Settings > Secrets and variables > Actions**:

| Secret | Lay o dau |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens |
| `SUPABASE_PROJECT_REF` | `<YOUR_PROJECT_REF>` (Phân chia theo GitHub Environment: tạo riêng cho `staging` và `production`) |
| `SUPABASE_DB_PASSWORD` | Settings > Database > Database password (Phân chia theo Environment) |

Thieu bat ky secret nao, workflow bao loi ro rang o buoc **Verify secrets** thay
vi that bai giua duong voi thong diep kho hieu.

---

## 3. `db:lint` chan nhung gi

Chay tu dong trong CI (`pnpm run check` va workflow CI).

| Muc | Ket qua | Ly do |
| --- | --- | --- |
| Ten file sai dinh dang `<version>_<ten>.sql` | **Loi** | CLI khong nhan ra |
| Hai file cung version | **Loi** | CLI chi ghi nhan mot ban, ban kia bi bo im lang |
| File rong | **Loi** | Gan nhu luon la sai sot |
| Version moi < version da ap dung | **Loi** | CLI se BO QUA file, ban tuong da chay |
| `drop table` / `truncate` / `drop column` / `drop schema` o file MOI | **Loi** | Mat du lieu khong phuc hoi duoc |
| Cung cau lenh do o file DA baseline | Canh bao | Da chay roi, sua cung vo nghia |
| `delete from` / `drop policy` | Canh bao | Rat pho bien, thuong nam trong than function |
| Thieu `if not exists` / `or replace` | Canh bao | Chay lai se loi |

Khi that su can cau lenh pha huy, them dong dau tien vao file:

```sql
-- allow-destructive: bo cot legacy_score, da migrate sang rating tu 20260812
```

Danh dau nay tat toan bo kiem tra pha huy cho rieng file do — nen phai ghi ly do
that, de nguoi doc sau hieu tai sao.

---

## 4. Bang lenh

| Lenh | Tac dung |
| --- | --- |
| `pnpm run db:lint` | Kiem tra migration (CI chay buoc nay) |
| `pnpm run db:normalize` | In ke hoach doi ten file trung version |
| `pnpm run db:baseline` | Sinh baseline tu danh sach file hien co |
| `pnpm run db:status` | So sanh Local vs Remote |
| `pnpm run db:push` | Ap dung migration tu may (thuong de CI lo) |
| `pnpm run functions:deploy` | Deploy Edge Function `server` |

---

## 5. Quy tac song con

1. **Khong bao gio sua mot migration da ap dung.** Viet file moi de sua tiep.
   File cu la lich su; sua no lam moi truong lech nhau khong the phat hien.
2. **Viet idempotent.** `create table if not exists`, `create or replace function`,
   `drop policy if exists` truoc `create policy`. Nho vay chay lai vo hai.
3. **Mot migration = mot y dinh.** De doc review va de khoanh vung khi co su co.
4. **Khong co rollback tu dong.** Postgres khong hoan tac DDL da commit. Muon lui
   thi viet migration moi lam nguoc lai — nen hay dry run truoc khi ap dung.
5. **Sao luu truoc thay doi lon.** Supabase Dashboard > Database > Backups.


## 6. DANH SACH 43 MIGRATION CHUA CHAY
> Xem chi tiet toan bo code SQL cua 43 file tai: ALL_PENDING_MIGRATIONS.sql