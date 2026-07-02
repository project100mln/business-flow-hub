
-- Auto-create client and install_request when contact status becomes 'install_scheduled'
CREATE OR REPLACE FUNCTION public.cold_contact_install_scheduled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_client_id uuid;
BEGIN
  IF NEW.status = 'install_scheduled'
     AND (OLD.status IS DISTINCT FROM 'install_scheduled')
     AND (OLD.status IS DISTINCT FROM 'passed_to_coordinator') THEN

    IF NEW.client_id IS NULL THEN
      INSERT INTO public.clients (full_name, phone, source, notes, created_by, assigned_to)
      VALUES (NEW.full_name, NEW.phone,
              COALESCE(NEW.source, NEW.contact_type::text),
              NEW.comment, NEW.added_by, NEW.assigned_operator)
      RETURNING id INTO new_client_id;
      NEW.client_id := new_client_id;
    ELSE
      new_client_id := NEW.client_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.install_requests WHERE contact_id = NEW.id) THEN
      INSERT INTO public.install_requests (
        client_id, contact_id, client_name, phone,
        desired_at, operator_comment, status, created_by
      ) VALUES (
        new_client_id, NEW.id, NEW.full_name, NEW.phone,
        NEW.next_contact_at, NEW.comment, 'new', NEW.assigned_operator
      );
    END IF;

    NEW.status := 'passed_to_coordinator';
  END IF;
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.cold_contact_install_scheduled() FROM PUBLIC, authenticated;

DROP TRIGGER IF EXISTS trg_cold_contact_install_scheduled ON public.cold_contacts;
CREATE TRIGGER trg_cold_contact_install_scheduled
  BEFORE UPDATE OF status ON public.cold_contacts
  FOR EACH ROW EXECUTE FUNCTION public.cold_contact_install_scheduled();

-- Per-operator report
CREATE OR REPLACE FUNCTION public.call_center_operator_stats()
RETURNS TABLE(
  user_id uuid, full_name text,
  total_contacts bigint, called bigint, connected bigint,
  refused bigint, callbacks bigint, installs bigint,
  conversion numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ur.user_id,
    p.full_name,
    (SELECT count(*) FROM public.cold_contacts c WHERE c.assigned_operator = ur.user_id) AS total_contacts,
    (SELECT count(DISTINCT ch.contact_id) FROM public.call_history ch WHERE ch.operator_id = ur.user_id) AS called,
    (SELECT count(*) FROM public.call_history ch WHERE ch.operator_id = ur.user_id AND ch.result IN ('connected','interested','install_scheduled','passed_to_coordinator')) AS connected,
    (SELECT count(*) FROM public.cold_contacts c WHERE c.assigned_operator = ur.user_id AND c.status = 'refused') AS refused,
    (SELECT count(*) FROM public.cold_contacts c WHERE c.assigned_operator = ur.user_id AND c.status IN ('callback','no_answer')) AS callbacks,
    (SELECT count(*) FROM public.cold_contacts c WHERE c.assigned_operator = ur.user_id AND c.status IN ('install_scheduled','passed_to_coordinator')) AS installs,
    CASE
      WHEN (SELECT count(DISTINCT ch.contact_id) FROM public.call_history ch WHERE ch.operator_id = ur.user_id) = 0 THEN 0
      ELSE round(
        (SELECT count(*)::numeric FROM public.cold_contacts c WHERE c.assigned_operator = ur.user_id AND c.status IN ('install_scheduled','passed_to_coordinator'))
        / (SELECT count(DISTINCT ch.contact_id)::numeric FROM public.call_history ch WHERE ch.operator_id = ur.user_id) * 100, 1)
    END AS conversion
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'operator'
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  ORDER BY p.full_name NULLS LAST;
$$;

REVOKE EXECUTE ON FUNCTION public.call_center_operator_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.call_center_operator_stats() TO authenticated;

-- Overall call-center report
CREATE OR REPLACE FUNCTION public.call_center_overview()
RETURNS TABLE(
  total_contacts bigint, unassigned bigint,
  calls_today bigint, calls_month bigint,
  installs bigint, operators_effectiveness numeric,
  ai_effectiveness numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.cold_contacts),
    (SELECT count(*) FROM public.cold_contacts WHERE assigned_operator IS NULL),
    (SELECT count(*) FROM public.call_history WHERE called_at::date = CURRENT_DATE),
    (SELECT count(*) FROM public.call_history WHERE called_at >= date_trunc('month', now())),
    (SELECT count(*) FROM public.cold_contacts WHERE status IN ('install_scheduled','passed_to_coordinator')),
    CASE WHEN (SELECT count(*) FROM public.call_history WHERE operator_id IS NOT NULL) = 0 THEN 0
      ELSE round(
        (SELECT count(*)::numeric FROM public.cold_contacts c
          WHERE c.status IN ('install_scheduled','passed_to_coordinator')
            AND EXISTS (SELECT 1 FROM public.call_history ch WHERE ch.contact_id = c.id AND ch.operator_id IS NOT NULL))
        / NULLIF((SELECT count(DISTINCT contact_id)::numeric FROM public.call_history WHERE operator_id IS NOT NULL),0) * 100, 1)
    END,
    0::numeric
  WHERE public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager');
$$;

REVOKE EXECUTE ON FUNCTION public.call_center_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.call_center_overview() TO authenticated;
