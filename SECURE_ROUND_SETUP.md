# Cài bản submit-round an toàn

Bản vá này thay luồng kết thúc ván từ 4 request tuần tự thành 1 request `submit-round`.

## Thứ tự bắt buộc

1. Mở Supabase > SQL Editor > New query.
2. Dán toàn bộ nội dung `supabase/migrations/20260731_secure_submit_round.sql` và bấm Run.
3. Trong terminal tại thư mục dự án, deploy Edge Function:

```powershell
npx supabase link --project-ref pujzeomddvquxeacblvr
npx supabase functions deploy server --no-verify-jwt
```

4. Build frontend:

```powershell
npm run build
```

5. Nếu build thành công:

```powershell
git add -A
git commit -m "Secure atomic round submission"
git push
```

## Luồng mới

- Khi mở game: client lấy một ticket dùng một lần qua `start-round`.
- Khi hoàn thành: client chỉ gọi `submit-round` một lần.
- Edge Function xác thực tài khoản, ticket, thời hạn và telemetry; sau đó tự tính điểm.
- RPC cập nhật 5 trục, session, streak, XP, Level và `xp_events` trong một transaction.
- Endpoint `award-xp` cũ bị vô hiệu hóa.
- Trình duyệt bị thu hồi quyền ghi trực tiếp các cột điểm/game state.
- Các thao tác cộng/reset điểm của Admin Panel được chuyển qua Edge Function và xác thực admin phía server.

## Kiểm tra nhanh

- Chơi một ván và mở DevTools > Network.
- Khi kết thúc chỉ được có một request `submit-round`.
- Request `award-xp` cũ phải trả HTTP 410.
- Gửi lại cùng một `roundId` phải bị báo `Round already submitted`.
