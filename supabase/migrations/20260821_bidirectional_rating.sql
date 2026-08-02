-- 20260821: apply_round_rating HAI CHIEU
--
-- Truoc: chi keo LEN (upward-only). Choi kem khong ha rating — UI van hien
-- 1000/1000 du van nay chi duoc 293. Nguoi choi yeu cau: choi kem / thua thi
-- chi so phai GIAM.
--
-- Sau: EMA hai chieu, khop src/app/lib/scoring.ts :: applyRoundRating
--   - cold start (current <= 0): lay thang round
--   - |gap| <= 3: snap ve round
--   - round > current: +40% gap (toi thieu +1)
--   - round < current: -28% gap (toi thieu -1)

set local search_path = public;

create or replace function public.apply_round_rating(
  p_current integer,
  p_round integer
)
returns integer
language sql
immutable
strict
as $$
  select case
    when greatest(0, least(1000, p_current)) <= 0
      then greatest(0, least(1000, p_round))

    when greatest(0, least(1000, p_round))
       = greatest(0, least(1000, p_current))
      then greatest(0, least(1000, p_current))

    when abs(
      greatest(0, least(1000, p_round))
      - greatest(0, least(1000, p_current))
    ) <= 3
      then greatest(0, least(1000, p_round))

    -- Keo LEN
    when greatest(0, least(1000, p_round))
       > greatest(0, least(1000, p_current))
      then least(1000, greatest(
        greatest(0, least(1000, p_current)) + 1,
        round(
          greatest(0, least(1000, p_current))
          + 0.4 * (
            greatest(0, least(1000, p_round))
            - greatest(0, least(1000, p_current))
          )
        )::integer
      ))

    -- Keo XUONG (alpha 0.28)
    else greatest(0, least(
      greatest(0, least(1000, p_current)) - 1,
      round(
        greatest(0, least(1000, p_current))
        + 0.28 * (
          greatest(0, least(1000, p_round))
          - greatest(0, least(1000, p_current))
        )
      )::integer
    ))
  end;
$$;

revoke all on function public.apply_round_rating(integer, integer)
  from public, anon, authenticated;
grant execute on function public.apply_round_rating(integer, integer)
  to service_role;

-- Float8 wrapper van uy thac ve ban integer (20260819).
do $$
begin
  if (
    select count(*) from pg_proc
    where proname = 'apply_round_rating'
      and pronamespace = 'public'::regnamespace
  ) < 1 then
    raise exception 'apply_round_rating missing';
  end if;

  if public.apply_round_rating(0, 300) <> 300 then
    raise exception 'cold start broken: (0,300)=%', public.apply_round_rating(0, 300);
  end if;
  if public.apply_round_rating(500, 600) <> 540 then
    raise exception 'up EMA broken: (500,600)=%', public.apply_round_rating(500, 600);
  end if;
  -- 1000 -> 293: 1000 + 0.28*(293-1000) = 1000 - 197.96 ≈ 802, min(999, 802)=802
  if public.apply_round_rating(1000, 293) <> 802 then
    raise exception 'down EMA broken: (1000,293)=% want 802',
      public.apply_round_rating(1000, 293);
  end if;
  if public.apply_round_rating(500, 500) <> 500 then
    raise exception 'equal broken';
  end if;

  raise notice 'OK: apply_round_rating hai chieu (len 0.4 / xuong 0.28)';
end $$;
