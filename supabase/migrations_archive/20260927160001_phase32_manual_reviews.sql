SET lock_timeout = '2s';
BEGIN;

CREATE TABLE IF NOT EXISTS public.manual_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.round_tickets(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  compensation_xp integer DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.manual_reviews ENABLE ROW LEVEL SECURITY;

-- Only admins can interact with this table
CREATE POLICY "Admins can manage manual_reviews"
  ON public.manual_reviews
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Update timestamp trigger
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.manual_reviews
  FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);

COMMIT;
