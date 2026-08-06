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
7. **Unit tests + coverage** — `pnpm run test:coverage`
   - Chạy Vitest và áp ngưỡng coverage trong `vitest.config.ts`.
8. **Simulation** — `pnpm run test:sim`
   - Chạy `sim-client`, `sim-games`, `sim-audit` trên logic thật.
9. **Build** — `pnpm run build:only`
   - Bắt lỗi bundle mà typecheck không thấy.
10. **Coverage artifact**
   - Upload thư mục `coverage` và giữ 14 ngày, kể cả khi một bước trước đó lỗi.

### Job `edge-functions`

Job này chạy:

```bash
deno check --node-modules-dir=auto supabase/functions/server/index.ts
```

Nó kiểm tra Hono, Supabase client, scoring và anti-cheat trong runtime Deno — phần bị `tsconfig.json` của app loại trừ. Job đã bỏ `continue-on-error`, vì vậy lỗi Edge Function **chặn merge** như lỗi frontend.

CI cài dependencies trước khi chạy Deno để Deno 2 đọc các import `npm:` qua workspace pnpm ổn định hơn.

## Chạy cùng bộ kiểm tra ở máy

```bash
pnpm run check
pnpm run build
```

`pnpm run check` hiện bao gồm typecheck, lint, Prettier, static scan, migration lint, coverage và simulation. `pnpm run build` typecheck lại rồi tạo bundle production.

Trước khi commit nên chạy:

```bash
pnpm run format
pnpm run check
pnpm run build
```

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

- `Typecheck / scan / test / build`
- `Edge Function typecheck`
