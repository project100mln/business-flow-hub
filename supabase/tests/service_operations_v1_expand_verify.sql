-- ============================================================
-- SERVICE OPERATIONS V1 — проверка фазы EXPAND
-- Запускать на чистой локальной базе ПОСЛЕ применения всех миграций
-- ВКЛЮЧАЯ ...expand.sql, но БЕЗ/ДО ...enforce.sql (или после — тесты
-- совместимости всё равно проходят, т.к. проверяют смену статуса по
-- валидным правилам; см. примечание к T4).
--
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/service_operations_v1_expand_verify.sql
--
-- Проверяет: структуру, RLS, сохранность старых статусов, старый CRUD,
-- завершение БЕЗ resolution, временные метки, одну feedback-задачу,
-- отсутствие дублей, план→первая заявка, done→следующая заявка, изоляцию A/B.
-- В конце ROLLBACK — база не меняется.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.login(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
END $$;

DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1';
        ub uuid := '00000000-0000-0000-0000-0000000000b1';
        ca uuid; cb uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (ua,'a@test.local'),(ub,'b@test.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.companies (name, slug) VALUES ('Company A','test-a') RETURNING id INTO ca;
  INSERT INTO public.companies (name, slug) VALUES ('Company B','test-b') RETURNING id INTO cb;
  INSERT INTO public.profiles (id, full_name, company_id) VALUES (ua,'User A',ca),(ub,'User B',cb)
    ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id;
  INSERT INTO public.user_roles (user_id, role, company_id) VALUES (ua,'admin',ca),(ub,'admin',cb);
  INSERT INTO public.clients (id, full_name, phone, company_id, created_by)
    VALUES ('00000000-0000-0000-0000-00000000c0a1','Клиент A','+7 700 111 22 33',ca,ua),
           ('00000000-0000-0000-0000-00000000c0b1','Клиент B','+7 700 999 88 77',cb,ub);
END $$;

SET ROLE authenticated;

-- ТЕСТ 1: структура — новые таблицы и ключевые поля на месте
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema='public' AND table_name IN ('service_plans','service_events');
  ASSERT n = 2, 'T1: нет service_plans/service_events';
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='service_requests'
     AND column_name IN ('service_type','coordinator_id','service_plan_id',
                         'previous_service_request_id','resolution','feedback_due_at','reschedule_count');
  ASSERT n = 7, format('T1: не все новые поля service_requests добавлены (%s/7)', n);
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='tasks' AND column_name IN ('task_type','service_request_id');
  ASSERT n = 2, 'T1: нет полей tasks.task_type/service_request_id';
  RAISE NOTICE 'T1 OK: структура на месте';
END $$;

-- ТЕСТ 2: RLS включён на новых таблицах
DO $$
DECLARE a bool; b bool;
BEGIN
  SELECT relrowsecurity INTO a FROM pg_class WHERE oid='public.service_plans'::regclass;
  SELECT relrowsecurity INTO b FROM pg_class WHERE oid='public.service_events'::regclass;
  ASSERT a AND b, 'T2: RLS не включён на service_plans/service_events';
  RAISE NOTICE 'T2 OK: RLS включён';
END $$;

-- ТЕСТ 3+4: старый CRUD и старые переходы new→in_progress→done БЕЗ resolution
DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1'; rid uuid;
BEGIN
  PERFORM pg_temp.login(ua);
  -- создание в стиле старого UI: без coordinator, без resolution
  INSERT INTO public.service_requests (client_id, issue, status, created_by, assignee_id)
    VALUES ('00000000-0000-0000-0000-00000000c0a1','Старый ремонт','new',ua,ua) RETURNING id INTO rid;
  -- старый статус 'in_progress' принимается (не переименован, FSM не блокирует в EXPAND)
  UPDATE public.service_requests SET status='in_progress' WHERE id=rid;
  ASSERT (SELECT started_at IS NOT NULL FROM public.service_requests WHERE id=rid), 'T4: started_at не заполнен';
  -- завершение БЕЗ resolution должно пройти в EXPAND
  UPDATE public.service_requests SET status='done' WHERE id=rid;
  ASSERT (SELECT completed_at IS NOT NULL FROM public.service_requests WHERE id=rid), 'T4: completed_at не заполнен';
  ASSERT (SELECT feedback_due_at IS NOT NULL FROM public.service_requests WHERE id=rid), 'T4: feedback_due_at не заполнен';
  PERFORM set_config('test.rid', rid::text, false);
  RAISE NOTICE 'T3/T4 OK: старый CRUD и завершение без resolution проходят, метки заполнены';
END $$;

-- ТЕСТ 5: ровно одна feedback-задача
DO $$
DECLARE rid uuid := current_setting('test.rid')::uuid; n int;
BEGIN
  SELECT count(*) INTO n FROM public.tasks WHERE service_request_id=rid AND task_type='service_feedback';
  ASSERT n = 1, format('T5: ожидалась 1 feedback, получено %s', n);
  RAISE NOTICE 'T5 OK: одна feedback-задача';
END $$;

-- ТЕСТ 6: нет дублей + редактирование заметки НЕ засоряет историю
DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1'; rid uuid := current_setting('test.rid')::uuid;
        ev_before int; ev_after int; fb int; nxt int;
BEGIN
  PERFORM pg_temp.login(ua);
  SELECT count(*) INTO ev_before FROM public.service_events WHERE service_request_id=rid;
  UPDATE public.service_requests SET notes='правка заметки' WHERE id=rid;  -- статус не меняется
  SELECT count(*) INTO ev_after FROM public.service_events WHERE service_request_id=rid;
  SELECT count(*) INTO fb  FROM public.tasks WHERE service_request_id=rid AND task_type='service_feedback';
  SELECT count(*) INTO nxt FROM public.service_requests WHERE previous_service_request_id=rid;
  ASSERT ev_after = ev_before, 'T6: правка заметки создала лишнее событие';
  ASSERT fb = 1,  'T6: дубль feedback';
  ASSERT nxt = 0, 'T6: разовая заявка не должна плодить следующую';
  RAISE NOTICE 'T6 OK: без дублей, редактирование заметки историю не засоряет';
END $$;

-- ТЕСТ 7: активный план создаёт ровно одну первую заявку
DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1'; pid uuid; n int;
BEGIN
  PERFORM pg_temp.login(ua);
  INSERT INTO public.service_plans (client_id, name, issue_template, interval_days, next_visit_at, coordinator_id, created_by)
    VALUES ('00000000-0000-0000-0000-00000000c0a1','ТО','Плановая замена',90, now()+interval '90 days', ua, ua)
    RETURNING id INTO pid;
  SELECT count(*) INTO n FROM public.service_requests WHERE service_plan_id=pid;
  ASSERT n = 1, format('T7: ожидалась 1 первая заявка, получено %s', n);
  PERFORM set_config('test.pid', pid::text, false);
  RAISE NOTICE 'T7 OK: план создал одну первую заявку';
END $$;

-- ТЕСТ 8: done по плановой заявке создаёт РОВНО одну следующую + feedback + upcoming
DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1'; pid uuid := current_setting('test.pid')::uuid;
        rid uuid; nxt int; up int;
BEGIN
  PERFORM pg_temp.login(ua);
  SELECT id INTO rid FROM public.service_requests WHERE service_plan_id=pid AND previous_service_request_id IS NULL;
  UPDATE public.service_requests SET status='in_progress' WHERE id=rid;
  UPDATE public.service_requests SET status='done', resolution='ok' WHERE id=rid;
  SELECT count(*) INTO nxt FROM public.service_requests WHERE previous_service_request_id=rid;
  ASSERT nxt = 1, format('T8: ожидалась 1 следующая заявка, получено %s', nxt);
  -- повторная попытка завершения не должна плодить дубли (статус уже done → без изменения)
  UPDATE public.service_requests SET notes='ещё раз' WHERE id=rid;
  SELECT count(*) INTO nxt FROM public.service_requests WHERE previous_service_request_id=rid;
  ASSERT nxt = 1, 'T8: повтор создал дубль следующей заявки';
  SELECT count(*) INTO up FROM public.tasks
    WHERE task_type='service_upcoming'
      AND service_request_id=(SELECT id FROM public.service_requests WHERE previous_service_request_id=rid);
  ASSERT up = 1, format('T8: ожидалась 1 upcoming, получено %s', up);
  RAISE NOTICE 'T8 OK: done по плану создал одну следующую заявку + upcoming, без дублей';
END $$;

-- ТЕСТ 9: изоляция — компания B не видит данные A
DO $$
DECLARE ub uuid := '00000000-0000-0000-0000-0000000000b1'; sr int; sp int; se int; tk int;
BEGIN
  PERFORM pg_temp.login(ub);
  SELECT count(*) INTO sr FROM public.service_requests;
  SELECT count(*) INTO sp FROM public.service_plans;
  SELECT count(*) INTO se FROM public.service_events;
  SELECT count(*) INTO tk FROM public.tasks WHERE task_type IN ('service_feedback','service_upcoming');
  ASSERT sr=0 AND sp=0 AND se=0 AND tk=0,
    format('T9: B видит чужое: sr=%s sp=%s se=%s tk=%s', sr, sp, se, tk);
  RAISE NOTICE 'T9 OK: компания B изолирована';
END $$;

RESET ROLE;
ROLLBACK;

\echo '============================================'
\echo 'EXPAND VERIFY: ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (rollback выполнен)'
\echo '============================================'
