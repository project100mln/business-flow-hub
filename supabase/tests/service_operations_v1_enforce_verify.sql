-- ============================================================
-- SERVICE OPERATIONS V1 — проверка фазы ENFORCE
-- Запускать на чистой локальной базе ПОСЛЕ применения ВСЕХ миграций,
-- ВКЛЮЧАЯ ...expand.sql И ...enforce.sql.
--
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/service_operations_v1_enforce_verify.sql
--
-- Проверяет: допустимые переходы проходят; недопустимые отклоняются;
-- done без resolution отклоняется; rescheduled без даты/причины отклоняется;
-- терминальные ограничения работают. В конце ROLLBACK.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.login(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
END $$;

DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1'; ca uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (ua,'a@test.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.companies (name, slug) VALUES ('Company A','test-a') RETURNING id INTO ca;
  INSERT INTO public.profiles (id, full_name, company_id) VALUES (ua,'User A',ca)
    ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id;
  INSERT INTO public.user_roles (user_id, role, company_id) VALUES (ua,'admin',ca);
  INSERT INTO public.clients (id, full_name, phone, company_id, created_by)
    VALUES ('00000000-0000-0000-0000-00000000c0a1','Клиент A','+7 700 111 22 33',ca,ua);
END $$;

-- --- ДИАГНОСТИКА совместимости старых данных (информационно) ---
DO $$
DECLARE bad_done int; bad_status int;
BEGIN
  SELECT count(*) INTO bad_done FROM public.service_requests
    WHERE status='done' AND (resolution IS NULL OR length(trim(resolution))=0);
  SELECT count(*) INTO bad_status FROM public.service_requests
    WHERE status NOT IN ('new','callback','scheduled','confirmed','assigned',
                         'en_route','arrived','in_progress','problem','rescheduled','done','cancelled');
  RAISE NOTICE 'ДИАГНОСТИКА: done без resolution = %, заявок с неизвестным статусом = %', bad_done, bad_status;
END $$;

SET ROLE authenticated;

-- ТЕСТ 1: полная допустимая цепочка проходит
DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1'; rid uuid;
BEGIN
  PERFORM pg_temp.login(ua);
  INSERT INTO public.service_requests (client_id, issue, status, coordinator_id, created_by)
    VALUES ('00000000-0000-0000-0000-00000000c0a1','цепочка','new',ua,ua) RETURNING id INTO rid;
  UPDATE public.service_requests SET status='scheduled', scheduled_at=now()+interval '1 day' WHERE id=rid;
  UPDATE public.service_requests SET status='confirmed' WHERE id=rid;
  UPDATE public.service_requests SET status='assigned', assignee_id=ua WHERE id=rid;
  UPDATE public.service_requests SET status='en_route' WHERE id=rid;
  UPDATE public.service_requests SET status='arrived' WHERE id=rid;
  UPDATE public.service_requests SET status='in_progress' WHERE id=rid;
  UPDATE public.service_requests SET status='done', resolution='готово' WHERE id=rid;
  ASSERT (SELECT status FROM public.service_requests WHERE id=rid)='done', 'T1: цепочка не завершилась';
  RAISE NOTICE 'T1 OK: полная допустимая цепочка прошла';
END $$;

-- ТЕСТ 2: недопустимые переходы отклоняются
DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1'; rid uuid; f1 bool:=false; f2 bool:=false;
BEGIN
  PERFORM pg_temp.login(ua);
  INSERT INTO public.service_requests (client_id, issue, status, coordinator_id, created_by)
    VALUES ('00000000-0000-0000-0000-00000000c0a1','fsm','new',ua,ua) RETURNING id INTO rid;
  BEGIN UPDATE public.service_requests SET status='in_progress' WHERE id=rid; EXCEPTION WHEN others THEN f1:=true; END;
  ASSERT f1, 'T2: new→in_progress должно быть отклонено';
  BEGIN UPDATE public.service_requests SET status='done', resolution='x' WHERE id=rid; EXCEPTION WHEN others THEN f2:=true; END;
  ASSERT f2, 'T2: new→done должно быть отклонено';
  RAISE NOTICE 'T2 OK: недопустимые переходы отклонены';
END $$;

-- ТЕСТ 3: done без resolution отклоняется
DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1'; rid uuid; f bool:=false;
BEGIN
  PERFORM pg_temp.login(ua);
  INSERT INTO public.service_requests (client_id, issue, status, coordinator_id, created_by)
    VALUES ('00000000-0000-0000-0000-00000000c0a1','no-res','in_progress',ua,ua) RETURNING id INTO rid;
  BEGIN UPDATE public.service_requests SET status='done' WHERE id=rid; EXCEPTION WHEN others THEN f:=true; END;
  ASSERT f, 'T3: done без resolution должно быть отклонено';
  RAISE NOTICE 'T3 OK: done без resolution отклонён';
END $$;

-- ТЕСТ 4: rescheduled без новой даты/причины отклоняется
DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1'; rid uuid; f1 bool:=false; f2 bool:=false;
        dt timestamptz := now()+interval '3 days';
BEGIN
  PERFORM pg_temp.login(ua);
  INSERT INTO public.service_requests (client_id, issue, status, scheduled_at, coordinator_id, created_by)
    VALUES ('00000000-0000-0000-0000-00000000c0a1','resch','scheduled',dt,ua,ua) RETURNING id INTO rid;
  BEGIN UPDATE public.service_requests SET status='rescheduled' WHERE id=rid; EXCEPTION WHEN others THEN f1:=true; END;
  ASSERT f1, 'T4: rescheduled без даты/причины должно быть отклонено';
  BEGIN UPDATE public.service_requests SET status='rescheduled', reschedule_reason='клиент занят' WHERE id=rid;
    EXCEPTION WHEN others THEN f2:=true; END;
  ASSERT f2, 'T4: rescheduled без НОВОЙ даты должно быть отклонено';
  -- корректный перенос проходит
  UPDATE public.service_requests
    SET status='rescheduled', reschedule_reason='клиент занят', scheduled_at=dt+interval '2 days' WHERE id=rid;
  ASSERT (SELECT reschedule_count FROM public.service_requests WHERE id=rid)=1, 'T4: reschedule_count не увеличился';
  RAISE NOTICE 'T4 OK: rescheduled без даты/причины отклонён, корректный — прошёл';
END $$;

-- ТЕСТ 5: терминальная защита — done нельзя вернуть в работу
DO $$
DECLARE ua uuid := '00000000-0000-0000-0000-0000000000a1'; rid uuid; f bool:=false;
BEGIN
  PERFORM pg_temp.login(ua);
  INSERT INTO public.service_requests (client_id, issue, status, coordinator_id, created_by)
    VALUES ('00000000-0000-0000-0000-00000000c0a1','term','in_progress',ua,ua) RETURNING id INTO rid;
  UPDATE public.service_requests SET status='done', resolution='ok' WHERE id=rid;
  BEGIN UPDATE public.service_requests SET status='in_progress' WHERE id=rid; EXCEPTION WHEN others THEN f:=true; END;
  ASSERT f, 'T5: done→in_progress должно быть отклонено';
  -- при этом правка заметки у завершённой заявки (без смены статуса) должна проходить
  UPDATE public.service_requests SET notes='пометка' WHERE id=rid;
  RAISE NOTICE 'T5 OK: терминальная защита работает; правка заметки завершённой заявки проходит';
END $$;

RESET ROLE;
ROLLBACK;

\echo '============================================'
\echo 'ENFORCE VERIFY: ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (rollback выполнен)'
\echo '============================================'
