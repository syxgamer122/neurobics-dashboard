-- 1. Index on total_xp for fast global ranking (XP leaderboard)
CREATE INDEX IF NOT EXISTS idx_profiles_total_xp_desc 
ON public.profiles (total_xp DESC NULLS LAST);

-- 2. Index on cognitive_index for fast CI ranking
-- Since cognitive_index is a deterministic SQL function, we can create an index using it.
CREATE INDEX IF NOT EXISTS idx_profiles_cognitive_index_desc 
ON public.profiles (public.cognitive_index(profiles) DESC NULLS LAST);

-- 3. Indexes for individual game leaderboards
-- These speed up queries that fetch top 100 players for specific games
CREATE INDEX IF NOT EXISTS idx_profiles_speed_score_desc ON public.profiles (speed_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_profiles_focus_score_desc ON public.profiles (focus_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_profiles_logic_score_desc ON public.profiles (algebraic_logic_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_profiles_memory_score_desc ON public.profiles (memory_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_profiles_spatial_score_desc ON public.profiles (spatial_score DESC NULLS LAST);

-- 4. Index on last_active_date to quickly filter active vs inactive users for decay calculations
CREATE INDEX IF NOT EXISTS idx_profiles_last_active_date 
ON public.profiles (last_active_date DESC NULLS LAST);
