-- 20260918000000_phase12_xp_ledger.sql
-- Áp dụng mô hình Ledger một chiều cho XP

SET lock_timeout = '2s';

-- 1. Thêm các cột peak_rating
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS peak_rating_focus int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS peak_rating_speed int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS peak_rating_memory int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS peak_rating_spatial int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS peak_rating_logic int NOT NULL DEFAULT 0;

-- 2. Trigger auto-bump total_xp từ xp_events
CREATE OR REPLACE FUNCTION public.bump_total_xp() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('gamification.is_xp_trigger', 'true', true);
  UPDATE public.profiles
  SET total_xp = GREATEST(0, coalesce(total_xp, 0) + NEW.xp_awarded)
  WHERE id = NEW.user_id;
  PERFORM set_config('gamification.is_xp_trigger', 'false', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xp_events_apply ON public.xp_events;
CREATE TRIGGER trg_xp_events_apply
AFTER INSERT ON public.xp_events
FOR EACH ROW
EXECUTE FUNCTION public.bump_total_xp();

-- 3. Trigger chặn các RPC cũ cập nhật total_xp trực tiếp
CREATE OR REPLACE FUNCTION public.block_manual_xp_update() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('gamification.is_xp_trigger', true) IS DISTINCT FROM 'true' THEN
    IF NEW.total_xp IS DISTINCT FROM OLD.total_xp THEN
      NEW.total_xp := OLD.total_xp;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_manual_xp_update ON public.profiles;
CREATE TRIGGER trg_block_manual_xp_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.block_manual_xp_update();

-- 4. Sửa admin_reset_stats để ghi log trừ điểm thay vì set thẳng 0
CREATE OR REPLACE FUNCTION public.admin_reset_stats(p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_xp integer;
BEGIN
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'aal', '') != 'aal2' then
    raise exception 'MFA verification required (aal2) for admin endpoints';
  end if;

  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required';
  end if;

  SELECT coalesce(total_xp, 0) INTO v_old_xp FROM public.profiles WHERE id = p_target FOR UPDATE;
  IF v_old_xp > 0 THEN
    INSERT INTO public.xp_events (user_id, game, round_score, xp_awarded)
    VALUES (p_target, 'admin_reset', 0, -v_old_xp);
  END IF;

  update public.profiles
  set
    total_xp = 0, -- Sẽ bị trigger block, nhưng không sao vì trigger xp_events đã trừ về 0
    algebraic_logic_score = 0,
    memory_score = 0,
    speed_score = 0,
    focus_score = 0,
    cfop_spatial_record = 0,
    schulte_sessions = 0,
    sudoku_sessions = 0,
    stroop_sessions = 0,
    reaction_sessions = 0,
    memory_sessions = 0,
    nback_sessions = 0,
    math_sessions = 0,
    stats_epoch = now()
  where id = p_target;

  insert into public.admin_audit (actor_id, action, target_id, context, request_id)
  values (auth.uid(), 'admin.reset', p_target, '{}'::jsonb, null);
END;
$$;

-- 5. Reconcile XP job
CREATE OR REPLACE FUNCTION public.check_xp_ledger()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_run_id uuid;
  v_mismatches int;
BEGIN
  insert into public.cron_runs (job_name, status) values ('check_xp_ledger', 'running') returning id into v_run_id;
  
  begin
    SELECT count(*) INTO v_mismatches 
    FROM public.profiles p 
    JOIN (SELECT user_id, sum(xp_awarded) s FROM public.xp_events GROUP BY 1) x ON x.user_id = p.id 
    WHERE coalesce(p.total_xp, 0) <> coalesce(x.s, 0);

    IF v_mismatches > 0 THEN
      PERFORM public.trigger_alert('xp_ledger_mismatch', 'P1', format('Found %s users with mismatched XP!', v_mismatches));
    END IF;

    update public.cron_runs set status = 'success', finished_at = now() where id = v_run_id;
  exception when others then
    update public.cron_runs set status = 'failed', finished_at = now(), error_details = sqlerrm where id = v_run_id;
  end;
END;
$$;
