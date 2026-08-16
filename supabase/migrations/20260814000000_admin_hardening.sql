-- Add admin_capabilities column to profiles
ALTER TABLE public.profiles 
ADD COLUMN admin_capabilities text[] DEFAULT '{}'::text[];

-- Backfill existing admins with all capabilities
UPDATE public.profiles 
SET admin_capabilities = '{read,grant,reset,delete}' 
WHERE role = 'admin';

-- Create admin_audit table
CREATE TABLE public.admin_audit (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    actor_id uuid REFERENCES auth.users(id) NOT NULL,
    target_id uuid REFERENCES auth.users(id),
    action text NOT NULL,
    context jsonb DEFAULT '{}'::jsonb,
    request_id text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on admin_audit
ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;

-- Allow insert via service role (bypasses RLS) or allow admin select
-- We can add a policy for admins to read audit logs if needed later
CREATE POLICY "Admins can view audit logs" ON public.admin_audit
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() 
            AND role = 'admin' 
            AND 'read' = ANY(admin_capabilities)
        )
    );

-- Enforce append-only by NOT providing UPDATE or DELETE policies
