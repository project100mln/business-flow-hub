-- ============================================================
-- OrbitOS: мультитенантность — Очередь 0
-- companies, company_id везде, приглашения, починка ролей
-- Правило: только additive. Единственные DROP в этом файле —
-- это DROP POLICY/CONSTRAINT для замены на более строгие
-- версии, ни одна таблица и ни одна строка данных не удаляется.
-- ============================================================

-- ============ 1. COMPANIES ============
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  enabled_modules jsonb NOT NULL DEFAULT '[
    "leads","clients","objects","deals","tasks","service",
    "installations","installments","warehouse","finance","staff","owner"
  ]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_companies_updated ON public.companies;
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- ============ 2. profiles.is_platform_admin (это ты — оператор OrbitOS,
--    отдельно от "admin"/"собственник" внутри одной компании) ============
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT p.is_platform_admin FROM public.profiles p WHERE p.id = _user_id), false);
$$;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, anon;

-- ============ 3. company_id в user_roles — источник правды "кто в какой компании" ============
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated, anon;

-- Явно на всякий случай гарантируем доступ и к более старым helper-функциям,
-- т.к. по умолчанию в этом окружении EXECUTE от PUBLIC не наследуется.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, anon;

-- ============ 4. COMPANY_INVITES — единственная "входная дверь" для новых людей ============
CREATE TABLE IF NOT EXISTS public.company_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'operator',
  email text,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_invites TO authenticated;
GRANT ALL ON public.company_invites TO service_role;
ALTER TABLE public.company_invites ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_invites_company ON public.company_invites (company_id);

-- ============ 5. company_id во ВСЕ 18 операционных таблиц + индексы ============
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'clients','calls','products','deals','tasks','installations','transactions',
    'notifications','objects','service_requests','installments','installment_payments',
    'cold_contacts','call_history','install_requests','app_settings','ai_operator','hyla_leads'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id)', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_company_id ON public.%I (company_id)', t, t);
  END LOOP;
END $$;

-- ============ 6. Бэкафилл: создаём HYLA как компанию №1, привязываем всё текущее к ней ============
DO $$
DECLARE
  hyla_id uuid;
  t text;
  tables text[] := ARRAY[
    'profiles','user_roles','clients','calls','products','deals','tasks','installations','transactions',
    'notifications','objects','service_requests','installments','installment_payments',
    'cold_contacts','call_history','install_requests','app_settings','ai_operator','hyla_leads'
  ];
BEGIN
  SELECT id INTO hyla_id FROM public.companies WHERE slug = 'hyla';
  IF hyla_id IS NULL THEN
    INSERT INTO public.companies (name, slug) VALUES ('PURE-HOME / HYLA', 'hyla') RETURNING id INTO hyla_id;
  END IF;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('UPDATE public.%I SET company_id = $1 WHERE company_id IS NULL', t) USING hyla_id;
  END LOOP;

  -- Существующие admin становятся platform_admin (это ты) — безопасный дефолт,
  -- т.к. сегодня admin-роль есть только у тебя.
  UPDATE public.profiles SET is_platform_admin = true
    WHERE id IN (SELECT user_id FROM public.user_roles WHERE role = 'admin');
END $$;

-- ============ 7. app_settings — особый случай: ключ был глобальным, теперь на компанию ============
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE public.app_settings ADD PRIMARY KEY (company_id, key);

-- ============ 8. Теперь, когда все строки заполнены — делаем company_id обязательным ============
DO $$
DECLARE
  t text;
  -- profiles НЕ включаем: без приглашения регистрация должна создать
  -- аккаунт без компании (безопасный пустой доступ), а не падать с ошибкой.
  tables text[] := ARRAY[
    'user_roles','clients','calls','products','deals','tasks','installations','transactions',
    'notifications','objects','service_requests','installments','installment_payments',
    'cold_contacts','call_history','install_requests','app_settings','ai_operator','hyla_leads'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', t);
  END LOOP;
END $$;

-- ============ 9. Автоштамп company_id при INSERT — фронтенду не нужно её передавать ============
CREATE OR REPLACE FUNCTION public.set_company_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_company_id();
  END IF;
  RETURN NEW;
END; $$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'clients','calls','products','deals','tasks','installations','transactions',
    'notifications','objects','service_requests','installments','installment_payments',
    'cold_contacts','call_history','install_requests','app_settings','ai_operator','hyla_leads'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_set_company ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_set_company BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_company_id()', t, t);
  END LOOP;
END $$;

-- ============ 10. handle_new_user — теперь по приглашению, а не по глобальному счётчику ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_invite public.company_invites%ROWTYPE;
  v_token text;
BEGIN
  v_token := NEW.raw_user_meta_data->>'invite_token';

  IF v_token IS NOT NULL THEN
    SELECT * INTO v_invite FROM public.company_invites
      WHERE token = v_token::uuid AND used_at IS NULL AND expires_at > now()
      LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, full_name, company_id)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), v_invite.company_id);

  IF v_invite.id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, company_id)
      VALUES (NEW.id, v_invite.role, v_invite.company_id);
    UPDATE public.company_invites SET used_at = now(), used_by = NEW.id WHERE id = v_invite.id;
  END IF;
  -- Без валидного приглашения: профиль создаётся без компании и без роли.
  -- is_staff() для такого юзера вернёт false — он не увидит ни одной чужой записи.

  RETURN NEW;
END; $$;

-- ============ 11. Создание новой компании + приглашений (RPC) ============
CREATE OR REPLACE FUNCTION public.create_company(_name text, _slug text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'forbidden: platform admin only'; END IF;
  INSERT INTO public.companies (name, slug) VALUES (_name, _slug) RETURNING id INTO _id;
  INSERT INTO public.ai_operator (name, company_id) VALUES ('AI Оператор', _id);
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.create_invite(_company_id uuid, _role public.app_role, _email text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _token uuid;
BEGIN
  IF NOT (
    public.is_platform_admin()
    OR (public.has_role(auth.uid(),'admin') AND public.current_company_id() = _company_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.company_invites (company_id, role, email, created_by)
    VALUES (_company_id, _role, _email, auth.uid())
    RETURNING token INTO _token;
  RETURN _token;
END; $$;

-- Публичная проверка токена на странице регистрации (до логина)
CREATE OR REPLACE FUNCTION public.check_invite(_token uuid)
RETURNS TABLE(company_name text, role public.app_role, is_valid boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.name, ci.role, (ci.used_at IS NULL AND ci.expires_at > now())
  FROM public.company_invites ci JOIN public.companies c ON c.id = ci.company_id
  WHERE ci.token = _token;
$$;

REVOKE EXECUTE ON FUNCTION public.create_company(text,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_invite(uuid, public.app_role, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_company(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invite(uuid, public.app_role, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_invite(uuid) TO anon, authenticated;

-- ============ 12. RLS: companies и company_invites ============
DROP POLICY IF EXISTS "companies_read" ON public.companies;
CREATE POLICY "companies_read" ON public.companies FOR SELECT TO authenticated
  USING (id = public.current_company_id() OR public.is_platform_admin());

DROP POLICY IF EXISTS "companies_platform_manage" ON public.companies;
CREATE POLICY "companies_platform_manage" ON public.companies FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "invites_read" ON public.company_invites;
CREATE POLICY "invites_read" ON public.company_invites FOR SELECT TO authenticated
  USING ((company_id = public.current_company_id() AND public.has_role(auth.uid(),'admin')) OR public.is_platform_admin());

DROP POLICY IF EXISTS "invites_manage" ON public.company_invites;
CREATE POLICY "invites_manage" ON public.company_invites FOR ALL TO authenticated
  USING ((company_id = public.current_company_id() AND public.has_role(auth.uid(),'admin')) OR public.is_platform_admin())
  WITH CHECK ((company_id = public.current_company_id() AND public.has_role(auth.uid(),'admin')) OR public.is_platform_admin());

-- ============ 13. Переписываем все существующие политики — добавляем компанию ============

-- profiles
DROP POLICY IF EXISTS "profiles_read_all_auth" ON public.profiles;
CREATE POLICY "profiles_read_company" ON public.profiles FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_platform_admin());

-- user_roles
DROP POLICY IF EXISTS "roles_read_own" ON public.user_roles;
CREATE POLICY "roles_read_own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (public.has_role(auth.uid(),'admin') AND company_id = public.current_company_id()) OR public.is_platform_admin());

DROP POLICY IF EXISTS "roles_admin_manage" ON public.user_roles;
CREATE POLICY "roles_admin_manage" ON public.user_roles FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin') AND company_id = public.current_company_id()) OR public.is_platform_admin())
  WITH CHECK ((public.has_role(auth.uid(),'admin') AND company_id = public.current_company_id()) OR public.is_platform_admin());

-- clients
DROP POLICY IF EXISTS "clients_staff_read" ON public.clients;
CREATE POLICY "clients_staff_read" ON public.clients FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "clients_staff_insert" ON public.clients;
CREATE POLICY "clients_staff_insert" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "clients_manage" ON public.clients;
CREATE POLICY "clients_manage" ON public.clients FOR UPDATE TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR assigned_to = auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "clients_delete_admin" ON public.clients;
CREATE POLICY "clients_delete_admin" ON public.clients FOR DELETE TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id());

-- calls
DROP POLICY IF EXISTS "calls_read" ON public.calls;
CREATE POLICY "calls_read" ON public.calls FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "calls_insert" ON public.calls;
CREATE POLICY "calls_insert" ON public.calls FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "calls_update" ON public.calls;
CREATE POLICY "calls_update" ON public.calls FOR UPDATE TO authenticated
  USING ((operator_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "calls_delete" ON public.calls;
CREATE POLICY "calls_delete" ON public.calls FOR DELETE TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id());

-- products
DROP POLICY IF EXISTS "products_read" ON public.products;
CREATE POLICY "products_read" ON public.products FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "products_manage" ON public.products;
CREATE POLICY "products_manage" ON public.products FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id())
  WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id());

-- deals
DROP POLICY IF EXISTS "deals_read" ON public.deals;
CREATE POLICY "deals_read" ON public.deals FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "deals_insert" ON public.deals;
CREATE POLICY "deals_insert" ON public.deals FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "deals_update" ON public.deals;
CREATE POLICY "deals_update" ON public.deals FOR UPDATE TO authenticated
  USING ((owner_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "deals_delete" ON public.deals;
CREATE POLICY "deals_delete" ON public.deals FOR DELETE TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id());

-- tasks
DROP POLICY IF EXISTS "tasks_read" ON public.tasks;
CREATE POLICY "tasks_read" ON public.tasks FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated
  USING ((assignee_id = auth.uid() OR created_by = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated
  USING ((created_by = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id());

-- installations
DROP POLICY IF EXISTS "inst_read" ON public.installations;
CREATE POLICY "inst_read" ON public.installations FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "inst_insert" ON public.installations;
CREATE POLICY "inst_insert" ON public.installations FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "inst_update" ON public.installations;
CREATE POLICY "inst_update" ON public.installations FOR UPDATE TO authenticated
  USING ((technician_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "inst_delete" ON public.installations;
CREATE POLICY "inst_delete" ON public.installations FOR DELETE TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id());

-- transactions
DROP POLICY IF EXISTS "tx_read" ON public.transactions;
CREATE POLICY "tx_read" ON public.transactions FOR SELECT TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "tx_manage" ON public.transactions;
CREATE POLICY "tx_manage" ON public.transactions FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id())
  WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id());

-- objects
DROP POLICY IF EXISTS "staff read objects" ON public.objects;
CREATE POLICY "staff read objects" ON public.objects FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "staff insert objects" ON public.objects;
CREATE POLICY "staff insert objects" ON public.objects FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "staff update objects" ON public.objects;
CREATE POLICY "staff update objects" ON public.objects FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "admin delete objects" ON public.objects;
CREATE POLICY "admin delete objects" ON public.objects FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND company_id = public.current_company_id());

-- service_requests
DROP POLICY IF EXISTS "staff read service" ON public.service_requests;
CREATE POLICY "staff read service" ON public.service_requests FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "staff insert service" ON public.service_requests;
CREATE POLICY "staff insert service" ON public.service_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "staff update service" ON public.service_requests;
CREATE POLICY "staff update service" ON public.service_requests FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "admin delete service" ON public.service_requests;
CREATE POLICY "admin delete service" ON public.service_requests FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND company_id = public.current_company_id());

-- installments
DROP POLICY IF EXISTS "staff read inst" ON public.installments;
CREATE POLICY "staff read inst" ON public.installments FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "staff insert inst" ON public.installments;
CREATE POLICY "staff insert inst" ON public.installments FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "staff update inst" ON public.installments;
CREATE POLICY "staff update inst" ON public.installments FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "admin delete inst" ON public.installments;
CREATE POLICY "admin delete inst" ON public.installments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND company_id = public.current_company_id());

-- installment_payments
DROP POLICY IF EXISTS "staff read inst pay" ON public.installment_payments;
CREATE POLICY "staff read inst pay" ON public.installment_payments FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "staff insert inst pay" ON public.installment_payments;
CREATE POLICY "staff insert inst pay" ON public.installment_payments FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "staff update inst pay" ON public.installment_payments;
CREATE POLICY "staff update inst pay" ON public.installment_payments FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "admin delete inst pay" ON public.installment_payments;
CREATE POLICY "admin delete inst pay" ON public.installment_payments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND company_id = public.current_company_id());

-- cold_contacts (текущая версия — read/update учитывают coordinator)
DROP POLICY IF EXISTS "cc_read" ON public.cold_contacts;
CREATE POLICY "cc_read" ON public.cold_contacts FOR SELECT TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'coordinator')
          OR assigned_operator = auth.uid() OR added_by = auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "cc_insert" ON public.cold_contacts;
CREATE POLICY "cc_insert" ON public.cold_contacts FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "cc_update" ON public.cold_contacts;
CREATE POLICY "cc_update" ON public.cold_contacts FOR UPDATE TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'coordinator')
          OR assigned_operator = auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "cc_delete" ON public.cold_contacts;
CREATE POLICY "cc_delete" ON public.cold_contacts FOR DELETE TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id());

-- call_history
DROP POLICY IF EXISTS "ch_read" ON public.call_history;
CREATE POLICY "ch_read" ON public.call_history FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "ch_insert" ON public.call_history;
CREATE POLICY "ch_insert" ON public.call_history FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "ch_update" ON public.call_history;
CREATE POLICY "ch_update" ON public.call_history FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "ch_delete" ON public.call_history;
CREATE POLICY "ch_delete" ON public.call_history FOR DELETE TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id());

-- install_requests
DROP POLICY IF EXISTS "ir_read" ON public.install_requests;
CREATE POLICY "ir_read" ON public.install_requests FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "ir_insert" ON public.install_requests;
CREATE POLICY "ir_insert" ON public.install_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "ir_update" ON public.install_requests;
CREATE POLICY "ir_update" ON public.install_requests FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "ir_delete" ON public.install_requests;
CREATE POLICY "ir_delete" ON public.install_requests FOR DELETE TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id());

-- app_settings
DROP POLICY IF EXISTS "admins read settings" ON public.app_settings;
CREATE POLICY "admins read settings" ON public.app_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "admins write settings" ON public.app_settings;
CREATE POLICY "admins write settings" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND company_id = public.current_company_id())
  WITH CHECK (public.has_role(auth.uid(),'admin') AND company_id = public.current_company_id());

-- ai_operator
DROP POLICY IF EXISTS "ai_op_read" ON public.ai_operator;
CREATE POLICY "ai_op_read" ON public.ai_operator FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "ai_op_write" ON public.ai_operator;
CREATE POLICY "ai_op_write" ON public.ai_operator FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND company_id = public.current_company_id())
  WITH CHECK (public.has_role(auth.uid(),'admin') AND company_id = public.current_company_id());

-- hyla_leads
DROP POLICY IF EXISTS "hyla_read" ON public.hyla_leads;
CREATE POLICY "hyla_read" ON public.hyla_leads FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "hyla_insert" ON public.hyla_leads;
CREATE POLICY "hyla_insert" ON public.hyla_leads FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "hyla_update" ON public.hyla_leads;
CREATE POLICY "hyla_update" ON public.hyla_leads FOR UPDATE TO authenticated
  USING ((operator_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "hyla_delete" ON public.hyla_leads;
CREATE POLICY "hyla_delete" ON public.hyla_leads FOR DELETE TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND company_id = public.current_company_id());

-- ============ 14. RPC-функции с ролями — тоже утекали между компаниями, чиним заодно ============
CREATE OR REPLACE FUNCTION public.list_operators()
RETURNS TABLE(user_id uuid, full_name text, contacts_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT ur.user_id, p.full_name,
    (SELECT count(*) FROM public.cold_contacts c WHERE c.assigned_operator = ur.user_id)
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'operator' AND ur.company_id = public.current_company_id()
  ORDER BY p.full_name NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.admin_rename_operator(_user_id uuid, _name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND company_id = public.current_company_id()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles SET full_name = _name WHERE id = _user_id;
END$$;

CREATE OR REPLACE FUNCTION public.admin_remove_operator(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND company_id = public.current_company_id() AND role = 'operator') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'operator' AND company_id = public.current_company_id();
  UPDATE public.cold_contacts SET assigned_operator = NULL WHERE assigned_operator = _user_id;
END$$;

CREATE OR REPLACE FUNCTION public.admin_add_operator(_email text, _name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid; existing_company uuid; my_company uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  my_company := public.current_company_id();
  SELECT id INTO uid FROM auth.users WHERE email = _email;
  IF uid IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  SELECT company_id INTO existing_company FROM public.user_roles WHERE user_id = uid LIMIT 1;
  IF existing_company IS NOT NULL AND existing_company <> my_company THEN
    RAISE EXCEPTION 'user_belongs_to_another_company';
  END IF;
  INSERT INTO public.user_roles(user_id, role, company_id) VALUES (uid, 'operator', my_company)
    ON CONFLICT (user_id, role) DO NOTHING;
  IF _name IS NOT NULL AND length(_name) > 0 THEN
    UPDATE public.profiles SET full_name = _name WHERE id = uid;
  END IF;
  RETURN uid;
END$$;

CREATE OR REPLACE FUNCTION public.admin_assign_contacts(_ids uuid[], _operator uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int; my_company uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  my_company := public.current_company_id();
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _operator AND company_id = my_company) THEN
    RAISE EXCEPTION 'operator_not_in_company';
  END IF;
  UPDATE public.cold_contacts SET assigned_operator = _operator WHERE id = ANY(_ids) AND company_id = my_company;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END$$;

-- ============ 15. PIN-код доступа — теперь свой на каждую компанию ============
CREATE OR REPLACE FUNCTION public.set_access_pin(_pin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF length(_pin) < 4 THEN RAISE EXCEPTION 'pin too short'; END IF;
  INSERT INTO public.app_settings(company_id, key, value, updated_by)
    VALUES (public.current_company_id(), 'call_base_pin', extensions.crypt(_pin, extensions.gen_salt('bf')), auth.uid())
    ON CONFLICT (company_id, key) DO UPDATE SET value = excluded.value, updated_at = now(), updated_by = auth.uid();
END$$;

CREATE OR REPLACE FUNCTION public.verify_access_pin(_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE h text;
BEGIN
  SELECT value INTO h FROM public.app_settings WHERE key = 'call_base_pin' AND company_id = public.current_company_id();
  IF h IS NULL THEN RETURN false; END IF;
  RETURN h = extensions.crypt(_pin, h);
END$$;

-- ============ 16. Ночная задача-напоминание — у неё нет auth.uid(), company_id берём из задачи ============
CREATE OR REPLACE FUNCTION public.notify_upcoming_cartridge_tasks()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted_count integer := 0;
BEGIN
  WITH ins AS (
    INSERT INTO public.notifications (user_id, title, body, type, related_task_id, company_id)
    SELECT
      COALESCE(t.assignee_id, t.created_by), 'Скоро: ' || t.title,
      'Срок выполнения через ~7 дней (' || to_char(t.due_at, 'DD.MM.YYYY') || ').',
      'cartridge_reminder', t.id, t.company_id
    FROM public.tasks t
    WHERE t.title ILIKE 'Замена картриджей%'
      AND t.status <> 'done'
      AND t.due_at IS NOT NULL
      AND t.due_at::date BETWEEN (now()::date + 6) AND (now()::date + 8)
      AND COALESCE(t.assignee_id, t.created_by) IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.related_task_id = t.id AND n.type = 'cartridge_reminder')
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM ins;
  RETURN inserted_count;
END; $$;
