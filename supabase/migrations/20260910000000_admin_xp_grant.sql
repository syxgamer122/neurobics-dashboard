SET lock_timeout = '2s';
-- ==============================================================================
-- 20260910000000_admin_xp_grant.sql
-- ==============================================================================
-- Cấp phát/set XP từ admin qua RPC để khoá hàng và ghi nhận dòng `xp_events`

create or replace function public.admin_grant_xp(p_target uuid, p_delta bigint, p_mode text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_xp bigint;
  v_new_xp bigint;
  v_diff bigint;
begin
  -- Kiem tra quyen admin va MFA (aal2) the contract ADR-0010
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'aal', '') != 'aal2' then
    raise exception 'MFA verification required (aal2) for admin endpoints';
  end if;

  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required';
  end if;

  -- FOR UPDATE de tranh race condition
  select total_xp into v_current_xp
  from public.profiles
  where id = p_target
  for update;

  if not found then
    raise exception 'Target user not found';
  end if;

  if p_mode = 'set' then
    v_new_xp := p_delta;
    v_diff := p_delta - coalesce(v_current_xp, 0);
  else
    v_new_xp := coalesce(v_current_xp, 0) + p_delta;
    v_diff := p_delta;
  end if;

  -- Cap nhat profile
  update public.profiles
  set total_xp = v_new_xp
  where id = p_target;

  -- Ghi so cai (neu co thay doi)
  if v_diff != 0 then
    insert into public.xp_events (user_id, delta, source, ref_id)
    values (p_target, v_diff, 'admin_grant', null);
  end if;

  -- Ghi log audit
  insert into public.admin_audit (actor_id, action, target_id, context, request_id)
  values (
    auth.uid(),
    'admin.xp_grant',
    p_target,
    jsonb_build_object('mode', p_mode, 'delta', p_delta, 'diff', v_diff, 'new_total', v_new_xp),
    null
  );

  return v_new_xp;
end;
$$;

revoke all on function public.admin_grant_xp(uuid, bigint, text) from public;
grant execute on function public.admin_grant_xp(uuid, bigint, text) to authenticated;
