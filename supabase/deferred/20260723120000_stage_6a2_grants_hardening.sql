-- Stage 6A-2 · Minimal grants hardening (STAGING ONLY, DEFERRED)
-- Target project (manual apply via local Supabase CLI): paasqagunmrjyqfxcred
-- DO NOT APPLY to production aublvqruopbcwbziclfi.
--
-- This file is intentionally placed under supabase/deferred/ so the Lovable
-- migration tooling does NOT pick it up. When ready, copy it into
-- supabase/migrations/ locally and apply against staging only, e.g.:
--   supabase link --project-ref paasqagunmrjyqfxcred
--   supabase db push
--
-- Scope (per approved plan from Stage 6A-1):
--   * Revoke PUBLIC EXECUTE on sensitive SECURITY DEFINER functions,
--     keep explicit EXECUTE for `authenticated` where the app needs it.
--   * Keep explicit EXECUTE for `anon` on public.check_invite(uuid) only.
--   * Revoke anon table privileges on user_roles, notifications, profiles,
--     company_invites (defence in depth on top of RLS).
--
-- Explicitly NOT in this migration:
--   * No changes to RLS policies (no CREATE/DROP POLICY).
--   * No changes to function bodies / signatures / owners.
--   * No rate-limit, no new RPC, no user_roles write-path changes.
--   * No frontend, .env, or Supabase client changes.
--
-- Trigger functions (set_company_id, calc_hyla_score, deals_automation,
-- cold_contact_install_scheduled, installment_payment_paid, set_updated_at,
-- notify_upcoming_cartridge_tasks, refresh_installment_statuses) are
-- intentionally left untouched: PUBLIC EXECUTE on trigger functions is
-- required by the trigger machinery and does not expose an RPC surface.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. SECURITY DEFINER functions: revoke PUBLIC, grant to authenticated only
-- ---------------------------------------------------------------------------

-- Access-PIN surface: only signed-in staff should be able to verify/set.
REVOKE EXECUTE ON FUNCTION public.verify_access_pin(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.verify_access_pin(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_access_pin(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_access_pin(text) TO authenticated;

-- Tenant / role helpers used by RLS and by the app after login.
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.current_company_id() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_company_id() TO authenticated;

-- Call-center admin RPCs: only signed-in users; role checks inside body.
REVOKE EXECUTE ON FUNCTION public.call_center_operator_stats() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.call_center_operator_stats() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.call_center_overview() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.call_center_overview() TO authenticated;

-- Invite check is intentionally usable without a session (public sign-up).
REVOKE EXECUTE ON FUNCTION public.check_invite(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_invite(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Table-level defence in depth for anon (RLS already restricts rows)
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.user_roles      FROM anon;
REVOKE ALL ON TABLE public.notifications   FROM anon;
REVOKE ALL ON TABLE public.profiles        FROM anon;
REVOKE ALL ON TABLE public.company_invites FROM anon;

COMMIT;
