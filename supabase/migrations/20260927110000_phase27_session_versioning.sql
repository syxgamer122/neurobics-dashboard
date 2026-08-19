믯쎿슯슿쎽슯슿ⶽⴀ 倀栀愀猀攀 ㈀㜀㨀 匀攀猀猀椀漀渀 嘀攀爀猀椀漀渀椀渀最ഀ
਍䈀䔀䜀䤀一㬀ഀ
਍ⴀⴀ ㄀⸀ 䄀搀搀 爀愀琀椀渀最开洀漀搀攀氀开瘀攀爀猀椀漀渀 琀漀 瀀爀漀昀椀氀攀猀ഀ
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rating_model_version integer DEFAULT 1 NOT NULL;਍ഀ
-- 2. Update population stats to filter by model version਍䌀刀䔀䄀吀䔀 伀刀 刀䔀倀䰀䄀䌀䔀 䘀唀一䌀吀䤀伀一 瀀甀戀氀椀挀⸀最攀琀开瀀漀瀀甀氀愀琀椀漀渀开猀琀愀琀猀⠀ഀ
  p_min_rounds integer default 5,਍  瀀开洀漀搀攀氀开瘀攀爀猀椀漀渀 椀渀琀攀最攀爀 搀攀昀愀甀氀琀 ㄀ഀ
)਍刀䔀吀唀刀一匀 琀愀戀氀攀⠀洀攀愀渀 搀漀甀戀氀攀 瀀爀攀挀椀猀椀漀渀Ⰰ 猀搀 搀漀甀戀氀攀 瀀爀攀挀椀猀椀漀渀Ⰰ 渀 戀椀最椀渀琀⤀ഀ
LANGUAGE sql਍匀吀䄀䈀䰀䔀ഀ
SECURITY DEFINER਍匀䔀吀 猀攀愀爀挀栀开瀀愀琀栀 㴀 ✀✀ഀ
AS $body$਍  圀䤀吀䠀 挀愀氀椀戀爀愀琀攀搀 䄀匀 ⠀ഀ
    SELECT cognitive_index as idx਍    䘀刀伀䴀 瀀甀戀氀椀挀⸀瀀爀漀昀椀氀攀猀开搀攀挀愀礀攀搀ഀ
    WHERE NOT flagged AND role != 'guest'਍      䄀一䐀 爀愀琀椀渀最开洀漀搀攀氀开瘀攀爀猀椀漀渀 㴀 挀漀愀氀攀猀挀攀⠀瀀开洀漀搀攀氀开瘀攀爀猀椀漀渀Ⰰ ㄀⤀ഀ
      AND (਍        挀漀愀氀攀猀挀攀⠀猀挀栀甀氀琀攀开猀攀猀猀椀漀渀猀Ⰰ 　⤀ഀ
        + coalesce(sudoku_sessions, 0)਍        ⬀ 挀漀愀氀攀猀挀攀⠀猀琀爀漀漀瀀开猀攀猀猀椀漀渀猀Ⰰ 　⤀ഀ
        + coalesce(reaction_sessions, 0)਍        ⬀ 挀漀愀氀攀猀挀攀⠀洀攀洀漀爀礀开猀攀猀猀椀漀渀猀Ⰰ 　⤀ഀ
        + coalesce(nback_sessions, 0)਍        ⬀ 挀漀愀氀攀猀挀攀⠀洀愀琀栀开猀攀猀猀椀漀渀猀Ⰰ 　⤀ഀ
        + coalesce(gonogo_sessions, 0)਍        ⬀ 挀漀愀氀攀猀挀攀⠀洀攀渀琀愀氀开猀攀猀猀椀漀渀猀Ⰰ 　⤀ഀ
        + coalesce(corsi_sessions, 0)਍        ⬀ 挀漀愀氀攀猀挀攀⠀琀爀愀椀氀开猀攀猀猀椀漀渀猀Ⰰ 　⤀ഀ
        + coalesce(search_sessions, 0)਍      ⤀ 㸀㴀 挀漀愀氀攀猀挀攀⠀瀀开洀椀渀开爀漀甀渀搀猀Ⰰ 㔀⤀ഀ
  )਍  匀䔀䰀䔀䌀吀 ഀ
    coalesce(avg(idx), 380) as mean,਍    挀漀愀氀攀猀挀攀⠀猀琀搀搀攀瘀开猀愀洀瀀⠀椀搀砀⤀Ⰰ ㄀㠀　⤀ 愀猀 猀搀Ⰰഀ
    count(*) as n਍  䘀刀伀䴀 挀愀氀椀戀爀愀琀攀搀㬀ഀ
$body$;਍ഀ
-- Update signatures to accept p_scorer_version, they already do in DB but we update them਍ⴀⴀ 䄀挀琀甀愀氀氀礀Ⰰ 眀愀椀琀⸀ 䤀 眀椀氀氀 樀甀猀琀 爀攀搀攀昀椀渀攀 猀甀戀洀椀琀开爀漀甀渀搀开琀爀愀渀猀愀挀琀椀漀渀 愀渀搀 猀甀戀洀椀琀开漀昀昀氀椀渀攀开爀漀甀渀搀开琀砀 琀漀 琀愀欀攀 瀀开猀挀漀爀攀爀开瘀攀爀猀椀漀渀 愀渀搀 猀攀琀 椀琀⸀ഀ
-- But since they are complex, I'll extract them from phase24 / phase23 and inject the param.਍ഀ
CREATE OR REPLACE FUNCTION public.submit_round_transaction(
  p_user_id uuid,
  p_ticket_id uuid,
  p_game text,
  p_axes jsonb,
  p_round_score integer,
  p_label text default null,
  p_time_ms integer default 0,
  p_telemetry_version integer default null,
  p_scorer_version text default null,
  p_inspector_version integer default null,
  p_occurred_at timestamptz default null,
  p_provenance text default 'online',
  p_scorer_version integer default 1,
  p_shared_inspector_version integer default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $
DECLARE
  v_ticket public.round_tickets%rowtype;


CREATE OR REPLACE FUNCTION public.submit_offline_round_tx(
  p_user_id uuid,
  p_client_round_id text,
  p_game text,
  p_started_at timestamptz,
  p_axes jsonb,
  p_round_score integer,
  p_label text,
  p_time_ms integer,
  p_is_hard_cheat boolean,
  p_cheat_reasons jsonb,
  p_scorer_version integer default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $
DECLARE
  v_ticket_id uuid;


COMMIT;਍ഀ
਍