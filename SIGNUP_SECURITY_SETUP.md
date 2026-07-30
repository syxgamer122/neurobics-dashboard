# Thiết lập bảo mật đăng ký Neurobics

## 1. Tạo Cloudflare Turnstile

1. Đăng nhập Cloudflare Dashboard.
2. Mở **Turnstile** > **Add widget**.
3. Thêm hostname production của Vercel và `localhost` để thử trên máy.
4. Chọn **Managed** rồi tạo widget.
5. Sao chép **Site Key** và **Secret Key**. Không đưa Secret Key vào GitHub/Vercel frontend.

## 2. Cấu hình frontend trên Vercel

Trong Vercel > Project > Settings > Environment Variables, thêm:

```text
VITE_TURNSTILE_SITE_KEY=<Site Key từ Cloudflare>
```

Áp dụng cho Production và Preview, sau đó redeploy.

Để chạy local, tạo `.env.local` (file này đã bị Git bỏ qua):

```text
VITE_TURNSTILE_SITE_KEY=<Site Key từ Cloudflare>
```

## 3. Tạo rate limiter trong Supabase

Mở Supabase > SQL Editor. Sao chép toàn bộ nội dung file:

```text
supabase/migrations/20260730_signup_security.sql
```

Dán vào query mới và bấm **Run**. Migration tạo bảng chỉ lưu SHA-256 của IP, bật RLS và tạo RPC nguyên tử giới hạn 5 lần/15 phút.

## 4. Cài Secret Key cho Edge Function

Không đặt Secret Key trong `.env` của Vercel. Secret này thuộc Supabase Edge Function.

```powershell
npx supabase login
npx supabase link --project-ref pujzeomddvquxeacblvr
npx supabase secrets set TURNSTILE_SECRET_KEY=YOUR_CLOUDFLARE_SECRET_KEY
```

## 5. Deploy Edge Function

```powershell
npx supabase functions deploy server
```

Chỉ push GitHub/Vercel là chưa đủ: `supabase/functions/server/index.tsx` phải được deploy lại lên Supabase.

## 6. Build và deploy frontend

```powershell
npm run build
git add .
git commit -m "Protect signup with Turnstile and rate limiting"
git push origin main
```

## 7. Kiểm thử

1. Mở Sign up: widget Turnstile phải xuất hiện.
2. Khi chưa xác minh, nút Sign up bị khóa.
3. Xác minh rồi tạo một tài khoản thử.
4. Gửi quá 5 lần trong 15 phút từ cùng IP: server phải trả HTTP 429.
5. Trong Supabase Table Editor, `signup_rate_limits` chỉ chứa hash, không chứa IP thô.

Turnstile token được server xác minh qua Siteverify; token hết hạn sau 5 phút và chỉ dùng một lần.
