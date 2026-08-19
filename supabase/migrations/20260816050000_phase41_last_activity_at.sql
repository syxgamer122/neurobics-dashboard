-- AI Review: Add last_activity_at for guest cleanup
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

-- Update existing profiles where last_active_date exists but is a date (we just cast it or use it as fallback)
UPDATE public.profiles SET last_activity_at = last_active_date::timestamptz WHERE last_activity_at IS NULL;
