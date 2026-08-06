# Mindgem Dashboard

Ứng dụng web luyện tập nhận thức: 11 bài tập trí não, chấm điểm theo nhiều trục
năng lực, theo dõi tiến bộ dài hạn, bảng xếp hạng và hệ thống nhiệm vụ / thành tựu.

Giao diện Việt – Anh (mặc định tiếng Việt). Frontend chạy trên Vercel, backend là
Supabase (Postgres + Edge Function viết bằng Hono/Deno).

---

## Yêu cầu

| Thứ | Phiên bản |
| --- | --- |
| Node.js | 24 (khớp với CI) |
| pnpm | 10 |
| Supabase | một project (miễn phí cũng được) |

> Dự án dùng **pnpm** và có `pnpm-lock.yaml`. Đừng chạy `npm install` — nó sẽ tạo
> `package-lock.json` và làm lệch dependency so với CI.

## Chạy ở máy

```bash
pnpm install
cp .env.example .env.local   # rồi điền giá trị thật
pnpm run dev
```

Mặc định mở ở `http://localhost:5173`.

## Biến môi trường

### Frontend — đặt trong `.env.local` (local) và Vercel → Environment Variables

| Biến | Bắt buộc | Ghi chú |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | ✅ | Dạng `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Khoá `sb_publishable_...` (khuyến nghị) hoặc anon JWT cũ; công khai theo thiết kế |
| `VITE_TURNSTILE_SITE_KEY` | ✅ | Cloudflare Turnstile. Khoá test: `1x00000000000000000000AA` |
| `VITE_TELEMETRY_ENDPOINT` | — | Ghi đè endpoint telemetry |
| `VITE_TELEMETRY_SAMPLE` | — | Tỷ lệ lấy mẫu, `0`–`1` |
| `VITE_TELEMETRY_OFF` | — | Đặt `1` để tắt telemetry |

Thiếu hai biến đầu thì app **không** crash — nó hiện thông báo hướng dẫn cấu hình
(xem `src/app/lib/supabase-config.ts`).

### Edge Function — đặt trong Supabase → Edge Functions → **Secrets**

| Biến | Bắt buộc | Ghi chú |
| --- | --- | --- |
| `SUPABASE_URL` | ✅ | Supabase tự cấp trong Edge runtime |
| `EDGE_SERVICE_ROLE_KEY` | ✅* | Khoá `sb_secret_...` mới; tự đặt trong Secrets |
| `SUPABASE_SERVICE_ROLE_KEY` | fallback | Khoá service-role JWT cũ do Supabase tự cấp; không cần tự tạo |
| `ALLOWED_ORIGINS` | ✅ | Danh sách origin, cách nhau bởi dấu phẩy |
| `RECOVERY_HMAC_SECRET` | ✅ | Tối thiểu 32 ký tự |
| `TURNSTILE_SECRET_KEY` | ✅ | Khoá bí mật phía server của Turnstile |
| `ALLOW_LOCALHOST_ORIGINS` | — | Đặt `1` **chỉ khi chạy local** |

> \* Edge Function cần **một trong hai** khoá quản trị: ưu tiên
> `EDGE_SERVICE_ROLE_KEY=sb_secret_...`, nếu không có thì code fallback về
> `SUPABASE_SERVICE_ROLE_KEY` cũ. Supabase không cho tự tạo secret có tiền tố
> `SUPABASE_`, vì vậy khoá mới phải dùng tên `EDGE_SERVICE_ROLE_KEY`.
>
> ⚠️ Không bao giờ đặt `sb_secret_...` vào biến bắt đầu bằng `VITE_`: mọi biến
> `VITE_` được đóng vào JavaScript gửi xuống trình duyệt. Không commit `.env`
> hay `.env.local`; và không bật `ALLOW_LOCALHOST_ORIGINS=1` trên production.

## Lệnh

### Phát triển

| Lệnh | Việc |
| --- | --- |
| `pnpm run dev` | Dev server |
| `pnpm run build` | Typecheck rồi build production |
| `pnpm run build:only` | Build, bỏ qua typecheck |

### Kiểm tra chất lượng

| Lệnh | Việc |
| --- | --- |
| `pnpm run check` | **Chạy tất cả bên dưới.** Nên chạy trước khi push |
| `pnpm run typecheck` | `tsc` cho app và cho web worker |
| `pnpm run lint` | ESLint 9 (flat config) |
| `pnpm run lint:fix` | ESLint tự sửa |
| `pnpm run format` | Prettier ghi đè |
| `pnpm run format:check` | Prettier chỉ kiểm tra |
| `pnpm run scan` | Quét i18n, hằng số, khoá localStorage |
| `pnpm run test` | Unit test (Vitest) |
| `pnpm run test:coverage` | Test kèm coverage |
| `pnpm run test:sim` | Mô phỏng client / game / audit |
| `pnpm run db:lint` | Kiểm tra tên và độ an toàn của migration |

### Database

| Lệnh | Việc |
| --- | --- |
| `pnpm run db:status` | Migration nào đã áp dụng |
| `pnpm run db:push` | Đẩy migration lên (cẩn thận) |
| `pnpm run db:normalize` | Chuẩn hoá tên file migration |
| `pnpm run db:baseline` | Dựng lại mốc baseline |
| `pnpm run functions:deploy` | Deploy Edge Function `server` |

## Cấu trúc

```
src/
  main.tsx                 điểm vào + đăng ký service worker
  app/
    App.tsx                shell, điều hướng, dock
    games/                 11 bài tập (mỗi file một game)
    components/            UI, panel, admin, dashboard
    hooks/                 use-round-submission…
    lib/
      api/                 gọi Supabase + Edge Function
      i18n/                từ điển vi / en
      scoring.ts           chấm điểm, rating, brain age
      observability.ts      telemetry phía client
      supabase-config.ts   đọc biến môi trường
supabase/
  functions/server/        Edge Function (Hono, Deno)
  functions/_shared/       scoring, anticheat, observability dùng chung
  migrations/              migration SQL
  baseline/                mốc migration đã áp dụng tay
tests/                     unit test + mô phỏng + scan
tools/                     script kiểm tra migration
docs/                      tài liệu chi tiết
```

## 11 bài tập

| ID | Tên | Nhóm năng lực |
| --- | --- | --- |
| `schulte` | Schulte Table | Chú ý thị giác |
| `sudoku` | Sudoku | Suy luận logic |
| `stroop` | Stroop | Ức chế phản xạ |
| `reaction` | Reaction Time | Tốc độ phản ứng |
| `memory` | Memory Matrix | Trí nhớ không gian |
| `nback` | N-Back | Trí nhớ làm việc |
| `math` | Math Sprint | Tính toán nhanh |
| `gonogo` | Go / No-Go | Kiểm soát xung động |
| `mental` | Mental Rotation | Tư duy không gian |
| `corsi` | Corsi Block | Trí nhớ chuỗi |
| `trail` | Trail Making | Chuyển đổi tập trung |

Muốn thêm game mới: đọc `docs/adding-a-game.md`.

## Migration

Quy tắc bắt buộc (được `pnpm run db:lint` áp dụng):

1. Tên file: `<14 chữ số>_<ten_thuong>.sql`, ví dụ `20260902000000_them_bang_moi.sql`
2. Mốc thời gian phải **lớn hơn** migration mới nhất hiện có
3. Câu lệnh phá huỷ (`drop table`, `truncate`, `drop column`, `drop schema`) bị
   chặn, trừ khi thêm dòng `-- allow-destructive: <lý do>`
4. `db:lint` phải ra **0 lỗi** trước khi commit

Chi tiết: `docs/migrations.md`.

## Deploy

**Frontend (Vercel)** — tự động khi có commit vào `main`. Nhánh khác tạo bản Preview.

**Backend (Supabase)** — chạy **tay** qua GitHub → Actions → *Deploy Supabase*.
Ô `dry run` mặc định được tích: workflow chỉ *in ra* những migration nó định chạy
mà không chạm vào database. Luôn chạy dry run và đọc log trước khi bỏ tích.

> Khối `push:` trong `.github/workflows/deploy-supabase.yml` đang **cố ý bị
> comment**. Lý do và điều kiện để bật nằm ngay đầu file đó — đọc trước khi mở.

Chi tiết: `docs/ci.md`.

## Bảo mật

- **RLS bật trên toàn bộ 14 bảng**, không có policy nào cấp cho `anon`
- `EDGE_SERVICE_ROLE_KEY` (`sb_secret_...`) hoặc service-role JWT cũ chỉ nằm trong Edge Function, không bao giờ ở frontend
- Đăng ký có Turnstile + giới hạn tần suất theo IP
- Mỗi vòng chơi cần một *ticket* do server phát; điểm được tính lại và kiểm tra
  chống gian lận ở server, không tin client
- CSP, HSTS, `X-Frame-Options` cấu hình trong `vercel.json`

## Tài liệu

| File | Nội dung |
| --- | --- |
| `docs/adding-a-game.md` | Thêm một game mới |
| `docs/migrations.md` | Quy trình migration |
| `docs/ci.md` | CI và deploy |
| `docs/observability.md` | Telemetry và bảng sự kiện |
| `guidelines/Guidelines.md` | Quy ước code |
| `SECURE_ROUND_SETUP.md` | Cơ chế ticket cho vòng chơi |
| `SIGNUP_SECURITY_SETUP.md` | Bảo mật luồng đăng ký |
| `ATTRIBUTIONS.md` | Bản quyền tài nguyên |

## Giấy phép

Dự án cá nhân, chưa cấp phép công khai. Xem `ATTRIBUTIONS.md` cho tài nguyên bên thứ ba.
