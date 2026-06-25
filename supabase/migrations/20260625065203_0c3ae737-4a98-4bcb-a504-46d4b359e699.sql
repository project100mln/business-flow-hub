
-- AI operator settings table
CREATE TABLE IF NOT EXISTS public.ai_operator (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'AI Оператор',
  phone_line text,
  script text,
  voice text DEFAULT 'female_ru',
  work_hours text DEFAULT '09:00-18:00',
  daily_call_limit int DEFAULT 100,
  connection_status text NOT NULL DEFAULT 'disconnected',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_operator TO authenticated;
GRANT ALL ON public.ai_operator TO service_role;
ALTER TABLE public.ai_operator ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_op_read ON public.ai_operator FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY ai_op_write ON public.ai_operator FOR ALL
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_ai_operator_updated BEFORE UPDATE ON public.ai_operator
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.ai_operator (name) SELECT 'AI Оператор'
  WHERE NOT EXISTS (SELECT 1 FROM public.ai_operator);

-- Tighten RLS on cold_contacts: operators see only own; admin/manager/coordinator see all
DROP POLICY IF EXISTS cc_read ON public.cold_contacts;
DROP POLICY IF EXISTS cc_update ON public.cold_contacts;
DROP POLICY IF EXISTS cc_delete ON public.cold_contacts;
DROP POLICY IF EXISTS cc_insert ON public.cold_contacts;

CREATE POLICY cc_read ON public.cold_contacts FOR SELECT USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
  OR has_role(auth.uid(),'coordinator')
  OR assigned_operator = auth.uid()
  OR added_by = auth.uid()
);
CREATE POLICY cc_insert ON public.cold_contacts FOR INSERT WITH CHECK (is_staff(auth.uid()));
CREATE POLICY cc_update ON public.cold_contacts FOR UPDATE USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
  OR has_role(auth.uid(),'coordinator')
  OR assigned_operator = auth.uid()
);
CREATE POLICY cc_delete ON public.cold_contacts FOR DELETE USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
);

-- Admin RPC: list all operators (users with operator role) with profile name
CREATE OR REPLACE FUNCTION public.list_operators()
RETURNS TABLE(user_id uuid, full_name text, contacts_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT ur.user_id, p.full_name,
    (SELECT count(*) FROM public.cold_contacts c WHERE c.assigned_operator = ur.user_id)
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'operator'
  ORDER BY p.full_name NULLS LAST;
$$;

-- Admin: rename operator (updates profile full_name)
CREATE OR REPLACE FUNCTION public.admin_rename_operator(_user_id uuid, _name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET full_name = _name WHERE id = _user_id;
END$$;

-- Admin: remove operator role (does not delete auth user)
CREATE OR REPLACE FUNCTION public.admin_remove_operator(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'operator';
  UPDATE public.cold_contacts SET assigned_operator = NULL WHERE assigned_operator = _user_id;
END$$;

-- Admin: grant operator role to an existing user by email
CREATE OR REPLACE FUNCTION public.admin_add_operator(_email text, _name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT id INTO uid FROM auth.users WHERE email = _email;
  IF uid IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (uid, 'operator')
    ON CONFLICT (user_id, role) DO NOTHING;
  IF _name IS NOT NULL AND length(_name) > 0 THEN
    UPDATE public.profiles SET full_name = _name WHERE id = uid;
  END IF;
  RETURN uid;
END$$;

-- Admin: bulk reassign
CREATE OR REPLACE FUNCTION public.admin_assign_contacts(_ids uuid[], _operator uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.cold_contacts SET assigned_operator = _operator WHERE id = ANY(_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END$$;
