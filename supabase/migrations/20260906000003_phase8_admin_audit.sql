SET lock_timeout = '2s';
-- ==============================================================================
-- 20260906000003_phase8_admin_audit.sql
-- ==============================================================================
-- Drop foreign key constraints on admin_audit to allow users to be deleted
-- without cascading or violating referential integrity. 
-- Audit logs should retain the UUID of the deleted user.

ALTER TABLE public.admin_audit 
  DROP CONSTRAINT IF EXISTS admin_audit_target_id_fkey;

ALTER TABLE public.admin_audit 
  DROP CONSTRAINT IF EXISTS admin_audit_actor_id_fkey;
