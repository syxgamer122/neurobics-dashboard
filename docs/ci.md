# CI

Trước đây repo không có CI: mọi lỗi type, test đỏ hay build vỡ chỉ lộ ra sau khi đã deploy lên Vercel. Giờ mọi `push` vào `main` và mọi pull request đều phải đi qua đúng bộ kiểm tra bạn chạy ở máy.

## Workflow

`.github/workflows/ci.yml` có hai job.

### Job `quality` (chặn merge)

| Bước | Lệnh | Chặn cái gì |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | `package.json` và `pnpm-lock.yaml` lệch nhau |
| Typecheck | `pnpm run typecheck` | Lỗi TypeScript ở app **và** sudoku worker |
| Static scan | `pnpm run scan` | 333 quy tắc nội bộ trong `tests/scan.mjs` (i18n thiếu key, hằng số lạc, localStorage trực tiếp…) |
| Unit tests | `pnpm run test` | `tests/*.test.ts` (vitest) |
| Simulation | `pnpm run test:sim` | Hồi quy cân bằng điểm / gameplay (`sim-client`, `sim-games`, `sim-audit`) |
| Build | `pnpm run build:only` | Lỗi bundle mà typecheck không thấy |

Kết quả build được upload thành artifact `dist` (giữ 7 ngày) để tải về so sánh khi cần.

### Job `edge-functions` (chỉ cảnh báo)

`deno check supabase/functions/server/index.ts` — bắt lỗi type của Edge Function, thứ mà `tsc` **không** kiểm tra (`tsconfig.json` đã exclude `supabase/`). Đặt `continue-on-error: true` vì Deno phải tải `npm:hono` qua mạng nên có thể flaky — báo để biết, không chặn merge.

## Chạy đúng bộ đó ở máy

```bash
pnpm run check
```

Nếu lệnh này xanh thì CI xanh. Thói quen nên giữ: chạy trước khi commit, đừng đợi GitHub báo.

## Không cần secret nào

CI chỉ typecheck / test / build nên không cần secret. `VITE_TURNSTILE_SITE_KEY` dùng **test key cóng khai của Cloudflare** (`1x00000000000000000000AA`, luôn pass) — khóa thật chỉ cần ở Vercel.

## Vì sao Vercel không thay được CI

Vercel chỉ chạy `pnpm run build`. Nó không chạy test, không chạy simulation, và khi nó báo lỗi thì code đã nằm trên `main` rồi. CI là nơi chặn; Vercel là nơi nhận kết quả.

## Xử lý sự cố

**`ERR_PNPM_OUTDATED_LOCKFILE`** — bạn sửa `package.json` mà chưa cập nhật lockfile. Chạy `pnpm install` ở máy rồi commit cả `pnpm-lock.yaml`.

**`test:sim` lỗi `Unknown option --experimental-strip-types`** — Node quá cũ. CI đã ghì Node 24; ở máy hãy dùng Node ≥ 22.6 (khuyến nghị 24).

**Job `edge-functions` đỏ** — đọc log: nếu là lỗi mạng khi tải `npm:hono` thì bỏ qua, nếu là lỗi type thật thì sửa.

**Muốn bắt buộc CI xanh mới merge được** — GitHub → Settings → Branches → Add rule cho `main` → *Require status checks to pass* → chọn **Typecheck / scan / test / build**.

## Bước tiếp theo (để sau)

Ba khuyết điểm còn lại chưa xử lý trong bản này: observability, migration chạy tay qua SQL Editor, độ phủ test hạn chế. Khi làm tiếp, mỗi thứ chỉ cần thêm một bước vào job `quality` (ví dụ `pnpm run db:lint`, `pnpm run test:coverage`) — khung CI đã sẵn.
