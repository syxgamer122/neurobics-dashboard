SET lock_timeout = '2s';
BEGIN;

-- 1. Thêm các Unique Constraints để tránh race conditions (lost-update, duplicated rewards)
-- duplicate constraint removed

-- Lưu ý: Nếu round_id chưa tồn tại trên training_sessions thì thêm, nhưng mặc định training_sessions sinh id uuid nên round_id chính là id. 
-- Giả sử ID của ticket chính là round_id của training_sessions thì:
-- Wait, in training_sessions, round_tickets id = round_id? 
-- The table might not have round_id, it just has id. Actually let's check schema.
-- I'll use the unique constraint mentioned by the reviewer.
-- redundant unique constraint on PK removed

CREATE UNIQUE INDEX IF NOT EXISTS xp_events_round_award_unique ON public.xp_events (round_id) WHERE event_type = 'round_award';

-- 2. Audit & Lock SECURITY DEFINER (sử dụng psql script để tự động set search_path = '')
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT
            p.oid::regprocedure AS proc_name
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.prosecdef = true
    LOOP
        EXECUTE 'ALTER FUNCTION ' || r.proc_name || ' SET search_path = ''''';
        EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.proc_name || ' FROM PUBLIC';
    END LOOP;
END
$$;

COMMIT;
