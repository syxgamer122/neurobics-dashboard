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
- **Điểm lợi**: Type-safety tuyệt đối trên toàn bộ Frontend và Backend (Edge Functions). Khi thêm game mới, chỉ cần khai báo vào Registry là TypeScript sẽ báo lỗi ở những nơi chưa handle game mới.
- **Điểm bất lợi**: Cần có công cụ (CI/test) để tự động hóa việc check parity giữa Registry (TS) và Schema (SQL).
