-- ============================================================
-- SERVICE OPERATIONS V1 — воспроизводимая проверка миграции
-- ============================================================
-- Запуск на ЧИСТОЙ локальной базе, ПОСЛЕ применения всех миграций:
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/service_operations_v1_verify.sql
--
-- Скрипт создаёт две компании (A и B) и двух пользователей, проверяет:
--   * автоматику (план → первая заявка → done → следующая заявка/feedback/upcoming);
--   * идемпотентность (повторный done не плодит дублей);
--   * разовая заявка / неактивный план НЕ создают следующую;
--   * FSM: недопустимый переход, done без resolution, rescheduled без даты/причины — отклоняются;
--   * RLS-изоляцию A/B по заявкам, планам, событиям и tasks.
--
-- Все проверки — через ASSERT/RAISE EXCEPTION: любой провал останавливает скрипт.
-- В конце делается ROLLBACK — база остаётся нетронутой.
-- ============================================================

BEGIN;

-- Хелпер: «залогиниться» как пользователь (эмулируем Supabase JWT для RLS)
CREATE OR REPLACE FUNCTION pg_temp.login(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
END $$;

-- --- Тестовые пользователи и компании ---
DO $$
DECLARE
  ua uuid := '00000000-0000-0000-0000-0000000000a1';
  ub uuid := '00000000-0000-0000-0000-0000000000b1';
  ca uuid; cb uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (ua, 'a@test.local'), (ub, 'b@test.local')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.companies (name, slug) VALUES ('Company A', 'test-a') RETURNING id INTO ca;
  INSERT INTO public.companies (name, slug) VALUES ('Company B', 'test-b') RETURNING id INTO cb;

  INSERT INTO public.profiles (id, full_name, company_id) VALUES (ua, 'User A', ca), (ub, 'User B', cb)
    ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id;
  INSERT INTO public.user_roles (user_id, role, company_id) VALUES (ua, 'admin', ca), (ub, 'admin', cb);

  INSERT INTO public.clients (id, full_name, phone, company_id, created_by)
    VALUES ('00000000-0000-0000-0000-00000000c0a1', 'Клиент A', '+7 700 111 22 33', ca, ua),
           ('00000000-0000-0000-0000-00000000c0b1', 'Клиент B', '+7 700 999 88 77', cb, ub);

  PERFORM set_config('test.ca', ca::text, false);
  PERFORM set_config('test.cb', cb::text, false);
END $$;

SET ROLE authenticated;

-- ============================================================
-- ТЕСТ 1: план обслуживания создаёт РОВНО одну первую заявку
-- ============================================================
DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1';
        plan_id uuid; cnt int;
BEGIN
  PERFORM pg_temp.login(ua);
  INSERT INTO public.service_plans (client_id, name, issue_template, interval_days, next_visit_at, coordinator_id, created_by)
    VALUES ('00000000-0000-0000-0000-00000000c0a1', 'ТО фильтра', 'Плановая замена картриджей', 90,
            now() + interval '90 days', ua, ua)
    RETURNING id INTO plan_id;

  SELECT count(*) INTO cnt FROM public.service_requests WHERE service_plan_id = plan_id;
  ASSERT cnt = 1, format('T1: ожидалась 1 первая заявка, получено %s', cnt);

  ASSERT (SELECT status FROM public.service_requests WHERE service_plan_id = plan_id) = 'scheduled',
    'T1: первая заявка должна быть scheduled';
  ASSERT (SELECT last_generated_at IS NOT NULL FROM public.service_plans WHERE id = plan_id),
    'T1: last_generated_at должен заполниться';
  PERFORM set_config('test.plan_a', plan_id::text, false);
  RAISE NOTICE 'T1 OK: план создал одну первую заявку';
END $$;

-- ============================================================
-- ТЕСТ 2: done → completed_at + событие + feedback + следующая заявка + upcoming
-- ============================================================
DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1';
        plan_id uuid := current_setting('test.plan_a')::uuid;
        req_id uuid; nxt int; fb int; up int; ev int;
BEGIN
  PERFORM pg_temp.login(ua);
  SELECT id INTO req_id FROM public.service_requests WHERE service_plan_id = plan_id AND previous_service_request_id IS NULL;

  -- корректная цепочка до done
  UPDATE public.service_requests SET status = 'confirmed' WHERE id = req_id;
  UPDATE public.service_requests SET status = 'assigned', assignee_id = ua WHERE id = req_id;
  UPDATE public.service_requests SET status = 'en_route' WHERE id = req_id;
  UPDATE public.service_requests SET status = 'arrived' WHERE id = req_id;
  UPDATE public.service_requests SET status = 'in_progress' WHERE id = req_id;
  UPDATE public.service_requests SET status = 'done', resolution = 'Картриджи заменены' WHERE id = req_id;

  ASSERT (SELECT completed_at IS NOT NULL FROM public.service_requests WHERE id = req_id), 'T2: completed_at не заполнен';
  ASSERT (SELECT feedback_due_at IS NOT NULL FROM public.service_requests WHERE id = req_id), 'T2: feedback_due_at не заполнен';
  ASSERT (SELECT confirmed_at IS NOT NULL AND departed_at IS NOT NULL AND arrived_at IS NOT NULL AND started_at IS NOT NULL
          FROM public.service_requests WHERE id = req_id), 'T2: не все временные метки заполнены';

  SELECT count(*) INTO nxt FROM public.service_requests WHERE previous_service_request_id = req_id;
  ASSERT nxt = 1, format('T2: ожидалась 1 следующая заявка, получено %s', nxt);
  ASSERT (SELECT status FROM public.service_requests WHERE previous_service_request_id = req_id) = 'scheduled',
    'T2: следующая заявка должна быть scheduled';

  SELECT count(*) INTO fb FROM public.tasks WHERE service_request_id = req_id AND task_type = 'service_feedback';
  ASSERT fb = 1, format('T2: ожидалась 1 feedback-задача, получено %s', fb);

  SELECT count(*) INTO up FROM public.tasks
    WHERE task_type = 'service_upcoming'
      AND service_request_id = (SELECT id FROM public.service_requests WHERE previous_service_request_id = req_id);
  ASSERT up = 1, format('T2: ожидалась 1 upcoming-задача, получено %s', up);

  SELECT count(*) INTO ev FROM public.service_events WHERE service_request_id = req_id;
  ASSERT ev >= 2, format('T2: ожидались события (created + переходы), получено %s', ev);

  PERFORM set_config('test.req_a', req_id::text, false);
  RAISE NOTICE 'T2 OK: done породил completed_at, событие, feedback, следующую заявку и upcoming';
END $$;

-- ============================================================
-- ТЕСТ 3: повторное сохранение done НЕ плодит дублей (идемпотентность)
-- ============================================================
DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1';
        req_id uuid := current_setting('test.req_a')::uuid; nxt int; fb int;
BEGIN
  PERFORM pg_temp.login(ua);
  UPDATE public.service_requests SET notes = 'повторное сохранение' WHERE id = req_id; -- статус не меняем
  SELECT count(*) INTO nxt FROM public.service_requests WHERE previous_service_request_id = req_id;
  SELECT count(*) INTO fb  FROM public.tasks WHERE service_request_id = req_id AND task_type = 'service_feedback';
  ASSERT nxt = 1, format('T3: дубль следующей заявки! %s', nxt);
  ASSERT fb  = 1, format('T3: дубль feedback! %s', fb);
  RAISE NOTICE 'T3 OK: повторное сохранение не создало дублей';
END $$;

-- ============================================================
-- ТЕСТ 4: разовая заявка (без плана) done — следующей заявки нет
-- ============================================================
DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1'; req_id uuid; nxt int;
BEGIN
  PERFORM pg_temp.login(ua);
  INSERT INTO public.service_requests (client_id, issue, status, coordinator_id, created_by)
    VALUES ('00000000-0000-0000-0000-00000000c0a1', 'Разовый ремонт', 'scheduled', ua, ua)
    RETURNING id INTO req_id;
  UPDATE public.service_requests SET status = 'confirmed' WHERE id = req_id;
  UPDATE public.service_requests SET status = 'assigned', assignee_id = ua WHERE id = req_id;
  UPDATE public.service_requests SET status = 'en_route' WHERE id = req_id;
  UPDATE public.service_requests SET status = 'arrived' WHERE id = req_id;
  UPDATE public.service_requests SET status = 'in_progress' WHERE id = req_id;
  UPDATE public.service_requests SET status = 'done', resolution = 'Готово' WHERE id = req_id;
  SELECT count(*) INTO nxt FROM public.service_requests WHERE previous_service_request_id = req_id;
  ASSERT nxt = 0, format('T4: разовая заявка не должна плодить следующую, получено %s', nxt);
  RAISE NOTICE 'T4 OK: разовая заявка не создала следующую';
END $$;

-- ============================================================
-- ТЕСТ 5: неактивный план — done не создаёт следующую
-- ============================================================
DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1'; plan_id uuid; req_id uuid; nxt int;
BEGIN
  PERFORM pg_temp.login(ua);
  INSERT INTO public.service_plans (client_id, name, issue_template, interval_days, next_visit_at, coordinator_id, created_by, is_active)
    VALUES ('00000000-0000-0000-0000-00000000c0a1', 'Приостановленный', 'ТО', 30, now() + interval '30 days', ua, ua, false)
    RETURNING id INTO plan_id;
  -- неактивный план не создаёт первую заявку
  ASSERT (SELECT count(*) FROM public.service_requests WHERE service_plan_id = plan_id) = 0,
    'T5: неактивный план не должен создавать первую заявку';
  -- вручную создаём заявку по этому плану и доводим до done
  INSERT INTO public.service_requests (client_id, issue, status, service_plan_id, coordinator_id, created_by)
    VALUES ('00000000-0000-0000-0000-00000000c0a1', 'ручной визит', 'in_progress', plan_id, ua, ua)
    RETURNING id INTO req_id;
  UPDATE public.service_requests SET status = 'done', resolution = 'ok' WHERE id = req_id;
  SELECT count(*) INTO nxt FROM public.service_requests WHERE previous_service_request_id = req_id;
  ASSERT nxt = 0, format('T5: неактивный план не должен создавать следующую, получено %s', nxt);
  RAISE NOTICE 'T5 OK: неактивный план не создал следующую заявку';
END $$;

-- ============================================================
-- ТЕСТ 6: FSM — недопустимый переход отклоняется
-- ============================================================
DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1'; req_id uuid; failed boolean := false;
BEGIN
  PERFORM pg_temp.login(ua);
  INSERT INTO public.service_requests (client_id, issue, status, coordinator_id, created_by)
    VALUES ('00000000-0000-0000-0000-00000000c0a1', 'fsm', 'new', ua, ua) RETURNING id INTO req_id;
  BEGIN
    UPDATE public.service_requests SET status = 'done', resolution = 'x' WHERE id = req_id; -- new→done запрещён
  EXCEPTION WHEN others THEN failed := true; END;
  ASSERT failed, 'T6: переход new→done должен быть отклонён';
  RAISE NOTICE 'T6 OK: недопустимый переход отклонён';
END $$;

-- ============================================================
-- ТЕСТ 7: done без resolution и rescheduled без даты/причины — отклоняются
-- ============================================================
DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1'; req_id uuid; f1 boolean := false; f2 boolean := false;
        old_dt timestamptz := now() + interval '5 days';
BEGIN
  PERFORM pg_temp.login(ua);
  INSERT INTO public.service_requests (client_id, issue, status, scheduled_at, coordinator_id, created_by)
    VALUES ('00000000-0000-0000-0000-00000000c0a1', 'req', 'in_progress', old_dt, ua, ua) RETURNING id INTO req_id;
  BEGIN
    UPDATE public.service_requests SET status = 'done' WHERE id = req_id; -- без resolution
  EXCEPTION WHEN others THEN f1 := true; END;
  ASSERT f1, 'T7: done без resolution должен быть отклонён';

  -- rescheduled без новой даты/причины
  INSERT INTO public.service_requests (client_id, issue, status, scheduled_at, coordinator_id, created_by)
    VALUES ('00000000-0000-0000-0000-00000000c0a1', 'req2', 'scheduled', old_dt, ua, ua) RETURNING id INTO req_id;
  BEGIN
    UPDATE public.service_requests SET status = 'rescheduled' WHERE id = req_id; -- нет новой даты и причины
  EXCEPTION WHEN others THEN f2 := true; END;
  ASSERT f2, 'T7: rescheduled без даты/причины должен быть отклонён';
  RAISE NOTICE 'T7 OK: done без resolution и rescheduled без данных отклонены';
END $$;

-- ============================================================
-- ТЕСТ 8: RLS-изоляция — B не видит данные A (заявки/планы/события/tasks)
-- ============================================================
DO $$
DECLARE ub uuid := '00000000-0000-0000-0000-0000000000b1';
        sr int; sp int; se int; tk int;
BEGIN
  PERFORM pg_temp.login(ub);
  SELECT count(*) INTO sr FROM public.service_requests;  -- у B своих заявок нет
  SELECT count(*) INTO sp FROM public.service_plans;
  SELECT count(*) INTO se FROM public.service_events;
  SELECT count(*) INTO tk FROM public.tasks WHERE task_type IN ('service_feedback','service_upcoming');
  ASSERT sr = 0, format('T8: B видит %s чужих заявок!', sr);
  ASSERT sp = 0, format('T8: B видит %s чужих планов!', sp);
  ASSERT se = 0, format('T8: B видит %s чужих событий!', se);
  ASSERT tk = 0, format('T8: B видит %s чужих сервисных задач!', tk);
  RAISE NOTICE 'T8 OK: компания B изолирована от данных компании A';
END $$;

RESET ROLE;
ROLLBACK;

\echo '============================================'
\echo 'ВСЕ ПРОВЕРКИ SERVICE OPERATIONS V1 ПРОЙДЕНЫ'
\echo '(изменения откачены — база не изменена)'
\echo '============================================'
