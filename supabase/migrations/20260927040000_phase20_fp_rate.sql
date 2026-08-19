SET lock_timeout = '2s';
CREATE TABLE IF NOT EXISTS public.cheat_flag_review_queue (
  flag_id uuid PRIMARY KEY REFERENCES public.cheat_flags(id) ON DELETE CASCADE,
  sampled_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewer_id uuid REFERENCES auth.users(id),
  review_status text
);

-- Add sampled_for_review column to cheat_flags if not exists
ALTER TABLE public.cheat_flags ADD COLUMN IF NOT EXISTS sampled_for_review boolean NOT NULL DEFAULT false;

-- Add cron job for sampling (weekly)
SELECT cron.schedule(
  'sample_cheat_flags',
  '0 0 * * 0', -- Every Sunday at midnight
  $$
    INSERT INTO public.cheat_flag_review_queue (flag_id, sampled_at)
    SELECT id, now() FROM public.cheat_flags
    WHERE severity = 'hard'
      AND created_at > now() - interval '7 days'
      AND review_status IS NULL
    ORDER BY random() LIMIT 50;
    
    UPDATE public.cheat_flags
    SET sampled_for_review = true
    WHERE id IN (SELECT flag_id FROM public.cheat_flag_review_queue WHERE sampled_at > now() - interval '1 hour');
  $$
);
