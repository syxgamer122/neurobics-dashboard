-- Thêm cột client_round_id để chống duplicate offline chính xác
ALTER TABLE round_tickets ADD COLUMN IF NOT EXISTS client_round_id uuid;

-- Tạo index unique chống farm XP/trùng lặp hoàn toàn
CREATE UNIQUE INDEX IF NOT EXISTS round_tickets_client_round_uniq
  ON round_tickets (user_id, client_round_id) 
  WHERE client_round_id IS NOT NULL;
