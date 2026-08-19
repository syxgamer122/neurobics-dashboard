SET lock_timeout = '2s';
-- Bang tinh nang (Feature Flags) ho tro rollout tu tu hoac tat mo game dong
CREATE TABLE public.feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  rollout_percentage integer,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
-- Ai cung the the xem flag dang bat hay tat, de client hoac server de dang truy cap
CREATE POLICY "Cho phep doc feature flags" ON public.feature_flags
  FOR SELECT TO public USING (true);

-- Them cac flag mac dinh cho tung game
INSERT INTO public.feature_flags (key, enabled) VALUES
  ('game_nback', true),
  ('game_gonogo', true),
  ('game_mental', true),
  ('game_math', true),
  ('game_stroop', true),
  ('game_corsi', true),
  ('game_trail', true),
  ('game_reaction', true),
  ('game_sudoku', true),
  ('game_memory', true),
  ('game_search', true),
  ('game_schulte', true);
