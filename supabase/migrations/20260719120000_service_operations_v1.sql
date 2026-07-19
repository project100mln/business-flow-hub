-- ============================================================
-- OrbitOS: SERVICE OPERATIONS V1
-- Диспетчеризация сервисных заявок, планы обслуживания,
-- журнал событий, перезвоны/обратная связь через tasks.
--
-- ПРАВИЛО: только additive. Никаких DROP таблиц/колонок,
-- никаких переименований, никакого удаления данных.
-- Единственные DROP здесь — DROP TRIGGER IF EXISTS перед
-- пересозданием собственных новых триггеров (идемпотентность).
-- Существующие таблицы/политики/автоматика (в т.ч. авто-задача
-- «Замена картриджей» после продажи) НЕ трогаются.
-- ============================================================

-- ============================================================
-- 1. SERVICE_PLANS — план периодического обслуживания
-- (создаётся первым: на него ссылается service_requests.service_plan_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  object_id uuid REFERENCES public.objects(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  name text NOT NULL,
  service_type text NOT NULL DEFAULT 'maintenance',
  issue_template text NOT NULL,
  interval_days integer NOT NULL CHECK (interval_days > 0),
  next_visit_at timestamptz NOT NULL,
  coordinator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'normal',
  estimated_cost numeric(14,2),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  last_generated_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_plans TO authenticated;
GRANT ALL ON public.service_plans TO service_role;
ALTER TABLE public.service_plans ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_service_plans_company_id     ON public.service_plans (company_id);
CREATE INDEX IF NOT EXISTS idx_service_plans_company_client ON public.service_plans (company_id, client_id);
CREATE INDEX IF NOT EXISTS idx_service_plans_company_next   ON public.service_plans (company_id, next_visit_at);
CREATE INDEX IF NOT EXISTS idx_service_plans_company_active ON public.service_plans (company_id, is_active);

-- RLS: строго внутри своей компании (тот же паттерн, что и у остальных таблиц)
DROP POLICY IF EXISTS "staff read service_plans"   ON public.service_plans;
CREATE POLICY "staff read service_plans"   ON public.service_plans FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "staff insert service_plans" ON public.service_plans;
CREATE POLICY "staff insert service_plans" ON public.service_plans FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "staff update service_plans" ON public.service_plans;
CREATE POLICY "staff update service_plans" ON public.service_plans FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "admin delete service_plans" ON public.service_plans;
CREATE POLICY "admin delete service_plans" ON public.service_plans FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND company_id = public.current_company_id());

DROP TRIGGER IF EXISTS trg_service_plans_set_company ON public.service_plans;
CREATE TRIGGER trg_service_plans_set_company BEFORE INSERT ON public.service_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id();
DROP TRIGGER IF EXISTS trg_service_plans_updated ON public.service_plans;
CREATE TRIGGER trg_service_plans_updated BEFORE UPDATE ON public.service_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 2. SERVICE_REQUESTS — новые поля (только ADD COLUMN IF NOT EXISTS)
-- ============================================================
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS service_plan_id uuid,
  ADD COLUMN IF NOT EXISTS previous_service_request_id uuid,
  ADD COLUMN IF NOT EXISTS coordinator_id uuid,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS departed_at timestamptz,
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS problem_resolved boolean,
  ADD COLUMN IF NOT EXISTS rescheduled_from timestamptz,
  ADD COLUMN IF NOT EXISTS reschedule_reason text,
  ADD COLUMN IF NOT EXISTS reschedule_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS feedback_due_at timestamptz;

-- FK-и добавляем идемпотентно (в этой версии PG нет ADD CONSTRAINT IF NOT EXISTS).
-- coordinator_id / previous_service_request_id повторяют существующий паттерн
-- (assignee_id/created_by → auth.users; self-FK → service_requests).
DO $$ BEGIN
  ALTER TABLE public.service_requests
    ADD CONSTRAINT service_requests_service_plan_id_fkey
    FOREIGN KEY (service_plan_id) REFERENCES public.service_plans(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.service_requests
    ADD CONSTRAINT service_requests_previous_service_request_id_fkey
    FOREIGN KEY (previous_service_request_id) REFERENCES public.service_requests(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.service_requests
    ADD CONSTRAINT service_requests_coordinator_id_fkey
    FOREIGN KEY (coordinator_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Бэкафилл: у исторических записей координатор = автор (безопасно, без потери данных).
UPDATE public.service_requests
  SET coordinator_id = created_by
  WHERE coordinator_id IS NULL AND created_by IS NOT NULL;

-- Индексы
CREATE INDEX IF NOT EXISTS idx_sr_company_status      ON public.service_requests (company_id, status);
CREATE INDEX IF NOT EXISTS idx_sr_company_scheduled   ON public.service_requests (company_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sr_company_assignee    ON public.service_requests (company_id, assignee_id);
CREATE INDEX IF NOT EXISTS idx_sr_company_coordinator ON public.service_requests (company_id, coordinator_id);
CREATE INDEX IF NOT EXISTS idx_sr_company_plan        ON public.service_requests (company_id, service_plan_id);
CREATE INDEX IF NOT EXISTS idx_sr_prev               ON public.service_requests (previous_service_request_id);

-- Защита: одна завершённая заявка не может породить две «следующие».
CREATE UNIQUE INDEX IF NOT EXISTS uq_sr_previous
  ON public.service_requests (previous_service_request_id)
  WHERE previous_service_request_id IS NOT NULL;

-- ============================================================
-- 3. SERVICE_EVENTS — неизменяемый журнал действий/переходов
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  service_request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.service_events TO authenticated;
GRANT ALL ON public.service_events TO service_role;
ALTER TABLE public.service_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_service_events_request  ON public.service_events (service_request_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_service_events_company  ON public.service_events (company_id, occurred_at);

-- RLS: читаем в своей компании; вставлять может персонал (ручные заметки),
-- но UPDATE-политики нет вовсе — журнал не редактируется. Удаление — только admin.
DROP POLICY IF EXISTS "staff read service_events"   ON public.service_events;
CREATE POLICY "staff read service_events"   ON public.service_events FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "staff insert service_events" ON public.service_events;
CREATE POLICY "staff insert service_events" ON public.service_events FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND company_id = public.current_company_id());
DROP POLICY IF EXISTS "admin delete service_events" ON public.service_events;
CREATE POLICY "admin delete service_events" ON public.service_events FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND company_id = public.current_company_id());

DROP TRIGGER IF EXISTS trg_service_events_set_company ON public.service_events;
CREATE TRIGGER trg_service_events_set_company BEFORE INSERT ON public.service_events
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

-- ============================================================
-- 4. TASKS — минимальные additive-поля для сервисных задач
-- (перезвоны/обратная связь/предстоящий сервис). Существующие поля
-- tasks (status, assignee_id, due_at, client_id, created_by) переиспользуем.
-- ============================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS task_type text,
  ADD COLUMN IF NOT EXISTS service_request_id uuid;

DO $$ BEGIN
  ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_service_request_id_fkey
    FOREIGN KEY (service_request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_company_type ON public.tasks (company_id, task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_service_req  ON public.tasks (service_request_id);

-- Не больше одной задачи service_feedback на одну заявку (идемпотентность автообратной связи).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_feedback_per_request
  ON public.tasks (service_request_id)
  WHERE task_type = 'service_feedback';

-- ============================================================
-- 5. FSM статусов + автоштамп временных меток (BEFORE UPDATE)
-- ============================================================
CREATE OR REPLACE FUNCTION public.service_request_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE ok boolean;
BEGIN
  -- Меняется только при смене статуса; обычное сохранение не трогаем.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Терминальные статусы менять нельзя.
  IF OLD.status IN ('done','cancelled') THEN
    RAISE EXCEPTION 'service: статус "%" терминальный — переход в "%" запрещён', OLD.status, NEW.status;
  END IF;

  ok := CASE OLD.status
    WHEN 'new'         THEN NEW.status IN ('callback','scheduled','cancelled')
    WHEN 'callback'    THEN NEW.status IN ('callback','scheduled','cancelled')
    WHEN 'scheduled'   THEN NEW.status IN ('confirmed','rescheduled','cancelled')
    WHEN 'confirmed'   THEN NEW.status IN ('assigned','rescheduled','cancelled')
    WHEN 'assigned'    THEN NEW.status IN ('en_route','rescheduled','cancelled')
    WHEN 'en_route'    THEN NEW.status IN ('arrived','problem','rescheduled')
    WHEN 'arrived'     THEN NEW.status IN ('in_progress','problem')
    WHEN 'in_progress' THEN NEW.status IN ('done','problem')
    WHEN 'problem'     THEN NEW.status IN ('in_progress','rescheduled','done','cancelled')
    WHEN 'rescheduled' THEN NEW.status IN ('scheduled','cancelled')
    ELSE false
  END;
  IF NOT ok THEN
    RAISE EXCEPTION 'service: недопустимый переход "%" → "%"', OLD.status, NEW.status;
  END IF;

  -- Автозаполнение временных меток
  IF NEW.status = 'confirmed'   AND NEW.confirmed_at IS NULL THEN NEW.confirmed_at := now(); END IF;
  IF NEW.status = 'en_route'    AND NEW.departed_at  IS NULL THEN NEW.departed_at  := now(); END IF;
  IF NEW.status = 'arrived'     AND NEW.arrived_at   IS NULL THEN NEW.arrived_at   := now(); END IF;
  IF NEW.status = 'in_progress' AND NEW.started_at   IS NULL THEN NEW.started_at   := now(); END IF;

  IF NEW.status = 'done' THEN
    IF NEW.resolution IS NULL OR length(trim(NEW.resolution)) = 0 THEN
      RAISE EXCEPTION 'service: нельзя завершить заявку без описания результата (resolution)';
    END IF;
    IF NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
    NEW.feedback_due_at := NEW.completed_at + interval '1 day';
  END IF;

  IF NEW.status = 'rescheduled' THEN
    IF NEW.reschedule_reason IS NULL OR length(trim(NEW.reschedule_reason)) = 0 THEN
      RAISE EXCEPTION 'service: перенос требует причину (reschedule_reason)';
    END IF;
    IF NEW.scheduled_at IS NULL OR NEW.scheduled_at IS NOT DISTINCT FROM OLD.scheduled_at THEN
      RAISE EXCEPTION 'service: перенос требует новую дату (scheduled_at)';
    END IF;
    NEW.rescheduled_from := OLD.scheduled_at;
    NEW.reschedule_count := COALESCE(OLD.reschedule_count, 0) + 1;
  END IF;

  RETURN NEW;
END;
$fn$;

-- ============================================================
-- 6. Кросс-компанийная защита ссылки на план (BEFORE INSERT/UPDATE).
-- Имя *_zguard — чтобы триггер шёл ПОСЛЕ trg_..._set_company (алфавит),
-- когда company_id уже проставлен.
-- ============================================================
CREATE OR REPLACE FUNCTION public.service_request_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_pcompany uuid;
BEGIN
  IF NEW.service_plan_id IS NOT NULL THEN
    SELECT company_id INTO v_pcompany FROM public.service_plans WHERE id = NEW.service_plan_id;
    IF v_pcompany IS NOT NULL AND v_pcompany <> NEW.company_id THEN
      RAISE EXCEPTION 'service: план обслуживания принадлежит другой компании';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_service_requests_zguard ON public.service_requests;
CREATE TRIGGER trg_service_requests_zguard
  BEFORE INSERT OR UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.service_request_guard();

-- ============================================================
-- 7. AFTER INSERT: журнал «создано»
-- ============================================================
CREATE OR REPLACE FUNCTION public.service_request_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.service_events (company_id, service_request_id, event_type, to_status, actor_id, notes)
  VALUES (
    NEW.company_id, NEW.id, 'created', NEW.status, auth.uid(),
    CASE WHEN NEW.previous_service_request_id IS NOT NULL
         THEN 'Автосоздано по плану обслуживания'
         WHEN NEW.service_plan_id IS NOT NULL
         THEN 'Первый визит по плану обслуживания'
         ELSE NULL END
  );
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_service_after_insert ON public.service_requests;
CREATE TRIGGER trg_service_after_insert AFTER INSERT ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.service_request_after_insert();

-- ============================================================
-- 8. AFTER UPDATE: журнал перехода + автообратная связь +
-- продолжение плана обслуживания + задача «предстоящий сервис».
-- Всё идемпотентно.
-- ============================================================
CREATE OR REPLACE FUNCTION public.service_request_after_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_plan         public.service_plans%ROWTYPE;
  v_next_date    timestamptz;
  v_new_id       uuid;
  v_upcoming_due timestamptz;
  v_owner        uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- (1) журнал перехода статуса
  INSERT INTO public.service_events (company_id, service_request_id, event_type, from_status, to_status, actor_id)
  VALUES (NEW.company_id, NEW.id, 'status_change', OLD.status, NEW.status, auth.uid());

  IF NEW.status = 'done' THEN
    v_owner := COALESCE(NEW.coordinator_id, NEW.created_by);

    -- (2) авто-обратная связь на следующий день (идемпотентно: uq_tasks_feedback_per_request)
    INSERT INTO public.tasks
      (company_id, title, description, status, client_id, assignee_id, created_by, due_at, service_request_id, task_type)
    VALUES (
      NEW.company_id,
      'Обратная связь после сервиса',
      'Проверить: качество замены/ремонта, решена ли проблема, есть ли жалоба. Заявка: ' || COALESCE(NEW.issue, ''),
      'todo', NEW.client_id, v_owner, v_owner,
      COALESCE(NEW.feedback_due_at, NEW.completed_at + interval '1 day'),
      NEW.id, 'service_feedback'
    )
    ON CONFLICT DO NOTHING;

    -- (3) продолжение периодического обслуживания
    IF NEW.service_plan_id IS NOT NULL THEN
      SELECT * INTO v_plan FROM public.service_plans WHERE id = NEW.service_plan_id FOR UPDATE;

      IF FOUND AND v_plan.is_active
         AND NOT EXISTS (SELECT 1 FROM public.service_requests WHERE previous_service_request_id = NEW.id)
      THEN
        v_next_date := COALESCE(NEW.completed_at, now()) + make_interval(days => v_plan.interval_days);

        UPDATE public.service_plans
          SET next_visit_at = v_next_date, last_generated_at = now()
          WHERE id = v_plan.id;

        INSERT INTO public.service_requests (
          company_id, client_id, object_id, product_id, issue, status, priority,
          scheduled_at, assignee_id, coordinator_id, cost, notes,
          service_type, service_plan_id, previous_service_request_id, created_by
        ) VALUES (
          NEW.company_id, v_plan.client_id, v_plan.object_id, v_plan.product_id,
          v_plan.issue_template, 'scheduled', v_plan.priority,
          v_next_date, v_plan.assignee_id, v_plan.coordinator_id,
          COALESCE(v_plan.estimated_cost, 0), v_plan.notes,
          v_plan.service_type, v_plan.id, NEW.id, v_plan.created_by
        ) RETURNING id INTO v_new_id;

        -- (4) внутренняя задача «предстоящий сервис»: за 7 дней до визита (или сейчас)
        v_upcoming_due := GREATEST(v_next_date - interval '7 days', now());
        INSERT INTO public.tasks
          (company_id, title, description, status, client_id, assignee_id, created_by, due_at, service_request_id, task_type)
        VALUES (
          NEW.company_id,
          'Предстоящий сервис',
          'Скоро плановый визит по плану «' || v_plan.name || '». Подготовить и подтвердить с клиентом.',
          'todo', v_plan.client_id,
          COALESCE(v_plan.coordinator_id, v_plan.created_by),
          COALESCE(v_plan.created_by, NEW.created_by),
          v_upcoming_due, v_new_id, 'service_upcoming'
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_service_validate ON public.service_requests;
CREATE TRIGGER trg_service_validate BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.service_request_validate();

DROP TRIGGER IF EXISTS trg_service_after_status ON public.service_requests;
CREATE TRIGGER trg_service_after_status AFTER UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.service_request_after_status();

-- ============================================================
-- 9. Первый визит по плану обслуживания (AFTER INSERT service_plans)
-- ============================================================
CREATE OR REPLACE FUNCTION public.service_plan_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.is_active THEN
    INSERT INTO public.service_requests (
      company_id, client_id, object_id, product_id, issue, status, priority,
      scheduled_at, assignee_id, coordinator_id, cost, notes,
      service_type, service_plan_id, created_by
    ) VALUES (
      NEW.company_id, NEW.client_id, NEW.object_id, NEW.product_id,
      NEW.issue_template, 'scheduled', NEW.priority,
      NEW.next_visit_at, NEW.assignee_id, NEW.coordinator_id,
      COALESCE(NEW.estimated_cost, 0), NEW.notes,
      NEW.service_type, NEW.id, NEW.created_by
    );
    UPDATE public.service_plans SET last_generated_at = now() WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_service_plans_after_insert ON public.service_plans;
CREATE TRIGGER trg_service_plans_after_insert AFTER INSERT ON public.service_plans
  FOR EACH ROW EXECUTE FUNCTION public.service_plan_after_insert();

-- ============================================================
-- 10. Индекс для поиска дублей клиентов по нормализованному телефону.
-- Только НЕуникальный индекс (безопасная нормализация ещё не гарантирована),
-- никакого UNIQUE вслепую. Нормализация = только цифры (как в JS: replace(/\D/g,'')).
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_clients_company_phone_norm
  ON public.clients (company_id, (regexp_replace(phone, '\D', '', 'g')));

-- ============================================================
-- Готово. Все изменения additive; исторические данные не тронуты.
-- ============================================================
