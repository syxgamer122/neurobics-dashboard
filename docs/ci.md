# CI

Mọi pull request và mọi push vào `main` đều chạy cùng bộ kiểm tra chất lượng. CI là lớp chặn trước khi Vercel hoặc Supabase nhận code.

## Workflow

`.github/workflows/ci.yml` có hai job và **cả hai đều chặn merge**.

### Job `quality`

1. **Install** — `pnpm install --frozen-lockfile`
   - Bắt `package.json` lệch `pnpm-lock.yaml`.
2. **Typecheck** — `pnpm run typecheck`
   - Kiểm tra app và Sudoku worker.
3. **Lint** — `pnpm run lint`
   - ESLint, React Hooks và Fast Refresh; `--max-warnings=0` nên một warning mới cũng làm CI đỏ.
4. **Format check** — `pnpm run format:check`
   - Chặn file chưa đúng Prettier.
5. **Static scan** — `pnpm run scan`
   - Kiểm tra i18n, hằng số, localStorage và các quy tắc riêng của repo.
6. **Migration lint** — `pnpm run db:lint`
   - Kiểm tra tên, thứ tự và lệnh SQL phá huỷ/rủi ro.
7. **Migration apply test (db:migrate:smoke)** — `supabase db start`
   - Khởi tạo DB ảo cục bộ và áp dụng toàn bộ schema migration từ đầu. Đảm bảo migration không bị lỗi cú pháp thực thi.
8. **Ledger invariants** — `pnpm run db:invariants`
   - Đổ seed data giả và chạy bài test invariant đảm bảo ledger XP luôn khớp.
9. **Unit tests + coverage** — `pnpm run test:coverage`
   - Chạy Vitest và áp ngưỡng coverage trong `vitest.config.ts`.
10. **Simulation** — `pnpm run test:sim`
   - Chạy `sim-client`, `sim-games`, `sim-audit` trên logic thật.
11. **Build** — `pnpm run build:only`
   - Bắt lỗi bundle mà typecheck không thấy.
12. **Bundle Budget & Security Audit** — `pnpm run check:bundle` & `pnpm run security:audit`
   - Bắt dung lượng JS phình to (>700KB) và quét lỗ hổng bảo mật gói npm.
13. **E2E Smoke Test (e2e:smoke)** — `playwright test`
   - Chạy 3 luồng chính: Auth, Play Round, Offline Enqueue.
14. **Coverage artifact**
   - Upload thư mục `coverage` và giữ 14 ngày, kể cả khi một bước trước đó lỗi.

### Job `edge-functions`

Job này chạy:

```bash
deno check --node-modules-dir=auto supabase/functions/server/index.ts
```

Nó kiểm tra Hono, Supabase client, scoring và anti-cheat trong runtime Deno — phần bị `tsconfig.json` của app loại trừ. Job đã bỏ `continue-on-error`, vì vậy lỗi Edge Function **chặn merge** như lỗi frontend.

CI cài dependencies trước khi chạy Deno để Deno 2 đọc các import `npm:` qua workspace pnpm ổn định hơn.

## Chạy cùng bộ kiểm tra ở máy

Lệnh `pnpm run check` chỉ là tập hợp con (subset) chạy cực nhanh bao gồm: typecheck, lint, Prettier, static scan, migration lint, coverage và simulation.

Để chạy đầy đủ bộ kiểm tra nội bộ gần sát với CI nhất trước khi tạo Pull Request, bạn cần chạy:

```bash
pnpm run format
pnpm run check
supabase db start
pnpm run check:bundle
pnpm run security:audit
pnpm dlx playwright test
pnpm run build
```

**Lưu ý khi cấu hình Require status checks to pass trên GitHub:**
Đảm bảo bạn nhập đúng tên job xuất hiện trên Actions UI:
- `quality`
- `edge-functions`

## CI không cần secret production

Job chất lượng không gọi database thật. `VITE_TURNSTILE_SITE_KEY` trong workflow là test site key công khai của Cloudflare (`1x00000000000000000000AA`).

Không đưa các giá trị sau vào workflow CI:

- `EDGE_SERVICE_ROLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RECOVERY_HMAC_SECRET`
- `TURNSTILE_SECRET_KEY` production

Các secret deploy nằm trong GitHub Environment/Supabase Secrets và chỉ được workflow deploy sử dụng khi cần.

## Vì sao Vercel không thay được CI

Vercel chủ yếu build frontend. Nó không thay thế migration lint, coverage, simulation hoặc `deno check`. CI chặn lỗi trước; Vercel chỉ nhận commit đã qua kiểm tra.

## Xử lý sự cố

### `ERR_PNPM_OUTDATED_LOCKFILE`

Bạn đã đổi dependency hoặc `package.json` nhưng chưa cập nhật lockfile:

```bash
pnpm install
```

Commit cả `package.json` và `pnpm-lock.yaml` nếu lockfile thay đổi.

### `format:check` đỏ

```bash
pnpm run format
pnpm run format:check
```

### `test:sim` báo không hiểu `--experimental-strip-types`

Node quá cũ. Dùng Node >= 22.6; repo và CI khuyến nghị Node 24.

### `edge-functions` đỏ

Không bỏ qua. Mở log `deno check` và sửa lỗi type/import. Các import dạng `npm:hono@...` là đúng cho Deno; trên VS Code phải cài extension `denoland.vscode-deno` để editor hiểu chúng.

### Bắt buộc CI xanh mới merge

GitHub → Settings → Branches/Rulesets → bảo vệ `main` → bật **Require status checks to pass** và chọn:

- `quality`
- `edge-functions`

## Ledger Invariants

To ensure the XP ledger remains accurate, the following invariant must hold:
```sql
SELECT id FROM profiles p
WHERE p.total_xp <> (
  SELECT coalesce(sum(xp_awarded),0) FROM xp_events e
  WHERE e.user_id = p.id AND e.created_at > coalesce(p.stats_epoch, '1970-01-01')
);
```
