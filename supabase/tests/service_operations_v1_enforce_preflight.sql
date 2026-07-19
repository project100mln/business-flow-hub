-- ============================================================
-- SERVICE OPERATIONS V1 — PREFLIGHT перед фазой ENFORCE
--
-- Запускать на ЦЕЛЕВОЙ базе (после EXPAND и выкладки нового фронтенда),
-- ДО того как ENFORCE будет добавлен отдельной миграцией с новым timestamp.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/service_operations_v1_enforce_preflight.sql
--
-- Preflight НИЧЕГО не исправляет и НИЧЕГО не удаляет — только читает.
-- Он показывает строки, которые после включения строгого FSM нельзя будет
-- корректно провести/перезавершить, и потенциальные нарушения инвариантов.
--
-- ПРАВИЛО ДОПУСКА: ENFORCE разрешается ТОЛЬКО если ВСЕ блокирующие выборки
-- вернули 0 строк (итоговая таблица `preflight_summary` — все bad_rows = 0,
-- и финальный DO-блок не выбросил исключение).
--
-- Автоисправление старых данных здесь НЕ делается и требует отдельного
-- разрешения (см. docs/service-operations-v1-rollout.md).
-- ============================================================

-- Только чтение: страхуемся от любых случайных записей в этой сессии.
BEGIN;
SET TRANSACTION READ ONLY;

\echo ''
\echo '=== PREFLIGHT ENFORCE: детализация по каждой проверке ==='

-- ------------------------------------------------------------
-- (1) done без resolution — их нельзя будет «пере-завершить».
-- ------------------------------------------------------------
\echo '--- (1) done без resolution ---'
SELECT id, company_id, status, completed_at
FROM public.service_requests
WHERE status = 'done'
  AND (resolution IS NULL OR length(trim(resolution)) = 0);

-- ------------------------------------------------------------
-- (2) неизвестные/устаревшие статусы (нет в новом FSM-словаре).
-- ------------------------------------------------------------
\echo '--- (2) неизвестные/устаревшие статусы ---'
SELECT id, company_id, status
FROM public.service_requests
WHERE status NOT IN ('new','callback','scheduled','confirmed','assigned',
                     'en_route','arrived','in_progress','problem',
                     'rescheduled','done','cancelled');

-- ------------------------------------------------------------
-- (3) заявки с некорректными переходными данными:
--     - done без completed_at;
--     - completed_at заполнен, но статус не done/не терминальный;
--     - отрицательный reschedule_count.
-- ------------------------------------------------------------
\echo '--- (3) некорректные переходные данные ---'
SELECT id, company_id, status, completed_at, reschedule_count,
       CASE
         WHEN status = 'done' AND completed_at IS NULL THEN 'done без completed_at'
         WHEN status NOT IN ('done','cancelled') AND completed_at IS NOT NULL THEN 'completed_at при незавершённом статусе'
         WHEN reschedule_count < 0 THEN 'reschedule_count < 0'
       END AS reason
FROM public.service_requests
WHERE (status = 'done' AND completed_at IS NULL)
   OR (status NOT IN ('done','cancelled') AND completed_at IS NOT NULL)
   OR (reschedule_count < 0);

-- ------------------------------------------------------------
-- (4) rescheduled без новой даты или без причины.
-- ------------------------------------------------------------
\echo '--- (4) rescheduled без даты/причины ---'
SELECT id, company_id, status, rescheduled_from, reschedule_reason
FROM public.service_requests
WHERE status = 'rescheduled'
  AND (rescheduled_from IS NULL
       OR reschedule_reason IS NULL
       OR length(trim(reschedule_reason)) = 0);

-- ------------------------------------------------------------
-- (5) возможные дубли feedback-задач: >1 service_feedback на заявку.
--     (uq_tasks_feedback_per_request блокирует новые; тут ищем исторические.)
-- ------------------------------------------------------------
\echo '--- (5) дубли feedback-задач ---'
SELECT service_request_id, count(*) AS feedback_tasks
FROM public.tasks
WHERE task_type = 'service_feedback' AND service_request_id IS NOT NULL
GROUP BY service_request_id
HAVING count(*) > 1;

-- ------------------------------------------------------------
-- (6) возможные дубли «следующих» заявок: >1 заявка на один previous_*.
--     (uq_sr_previous блокирует новые; тут ищем исторические.)
-- ------------------------------------------------------------
\echo '--- (6) дубли следующих заявок ---'
SELECT previous_service_request_id, count(*) AS next_requests
FROM public.service_requests
WHERE previous_service_request_id IS NOT NULL
GROUP BY previous_service_request_id
HAVING count(*) > 1;

-- ------------------------------------------------------------
-- (7) нарушения company_id между связанными сущностями.
--     Сравниваем только когда обе стороны NOT NULL и company_id различаются.
-- ------------------------------------------------------------
\echo '--- (7a) service_requests.service_plan_id → чужой company_id ---'
SELECT sr.id AS service_request_id, sr.company_id AS sr_company, sp.company_id AS plan_company
FROM public.service_requests sr
JOIN public.service_plans sp ON sp.id = sr.service_plan_id
WHERE sr.company_id IS NOT NULL AND sr.company_id <> sp.company_id;

\echo '--- (7b) service_requests.previous_service_request_id → чужой company_id ---'
SELECT sr.id AS service_request_id, sr.company_id AS sr_company, prev.company_id AS prev_company
FROM public.service_requests sr
JOIN public.service_requests prev ON prev.id = sr.previous_service_request_id
WHERE sr.company_id IS NOT NULL AND prev.company_id IS NOT NULL
  AND sr.company_id <> prev.company_id;

\echo '--- (7c) tasks.service_request_id → чужой company_id ---'
SELECT t.id AS task_id, t.company_id AS task_company, sr.company_id AS sr_company
FROM public.tasks t
JOIN public.service_requests sr ON sr.id = t.service_request_id
WHERE t.company_id IS NOT NULL AND sr.company_id IS NOT NULL
  AND t.company_id <> sr.company_id;

\echo '--- (7d) service_events.service_request_id → чужой company_id ---'
SELECT se.id AS event_id, se.company_id AS event_company, sr.company_id AS sr_company
FROM public.service_events se
JOIN public.service_requests sr ON sr.id = se.service_request_id
WHERE se.company_id <> sr.company_id;

-- ============================================================
-- ИТОГОВАЯ СВОДКА: все bad_rows обязаны быть 0.
-- ============================================================
\echo ''
\echo '=== preflight_summary (все bad_rows должны быть 0) ==='
WITH
c1 AS (SELECT count(*) n FROM public.service_requests
       WHERE status='done' AND (resolution IS NULL OR length(trim(resolution))=0)),
c2 AS (SELECT count(*) n FROM public.service_requests
       WHERE status NOT IN ('new','callback','scheduled','confirmed','assigned',
                            'en_route','arrived','in_progress','problem','rescheduled','done','cancelled')),
c3 AS (SELECT count(*) n FROM public.service_requests
       WHERE (status='done' AND completed_at IS NULL)
          OR (status NOT IN ('done','cancelled') AND completed_at IS NOT NULL)
          OR (reschedule_count < 0)),
c4 AS (SELECT count(*) n FROM public.service_requests
       WHERE status='rescheduled'
         AND (rescheduled_from IS NULL OR reschedule_reason IS NULL OR length(trim(reschedule_reason))=0)),
c5 AS (SELECT count(*) n FROM (
         SELECT 1 FROM public.tasks
         WHERE task_type='service_feedback' AND service_request_id IS NOT NULL
         GROUP BY service_request_id HAVING count(*) > 1) x),
c6 AS (SELECT count(*) n FROM (
         SELECT 1 FROM public.service_requests
         WHERE previous_service_request_id IS NOT NULL
         GROUP BY previous_service_request_id HAVING count(*) > 1) x),
c7 AS (SELECT
         (SELECT count(*) FROM public.service_requests sr JOIN public.service_plans sp ON sp.id=sr.service_plan_id
            WHERE sr.company_id IS NOT NULL AND sr.company_id<>sp.company_id)
       + (SELECT count(*) FROM public.service_requests sr JOIN public.service_requests p ON p.id=sr.previous_service_request_id
            WHERE sr.company_id IS NOT NULL AND p.company_id IS NOT NULL AND sr.company_id<>p.company_id)
       + (SELECT count(*) FROM public.tasks t JOIN public.service_requests sr ON sr.id=t.service_request_id
            WHERE t.company_id IS NOT NULL AND sr.company_id IS NOT NULL AND t.company_id<>sr.company_id)
       + (SELECT count(*) FROM public.service_events se JOIN public.service_requests sr ON sr.id=se.service_request_id
            WHERE se.company_id<>sr.company_id) AS n)
SELECT check_name, bad_rows FROM (
  SELECT 1 ord, '(1) done без resolution'            check_name, (SELECT n FROM c1) bad_rows
  UNION ALL SELECT 2, '(2) неизвестные статусы',        (SELECT n FROM c2)
  UNION ALL SELECT 3, '(3) некорректные переходные данные', (SELECT n FROM c3)
  UNION ALL SELECT 4, '(4) rescheduled без даты/причины', (SELECT n FROM c4)
  UNION ALL SELECT 5, '(5) дубли feedback-задач',        (SELECT n FROM c5)
  UNION ALL SELECT 6, '(6) дубли следующих заявок',      (SELECT n FROM c6)
  UNION ALL SELECT 7, '(7) company_id нарушения',        (SELECT n FROM c7)
) s ORDER BY ord;

-- ============================================================
-- ЖЁСТКИЙ ГЕЙТ: любое ненулевое значение — прервать с ошибкой,
-- чтобы preflight падал под ON_ERROR_STOP и НЕ давал зелёный свет ENFORCE.
-- ============================================================
DO $$
DECLARE total int;
BEGIN
  SELECT
      (SELECT count(*) FROM public.service_requests
         WHERE status='done' AND (resolution IS NULL OR length(trim(resolution))=0))
    + (SELECT count(*) FROM public.service_requests
         WHERE status NOT IN ('new','callback','scheduled','confirmed','assigned',
                              'en_route','arrived','in_progress','problem','rescheduled','done','cancelled'))
    + (SELECT count(*) FROM public.service_requests
         WHERE (status='done' AND completed_at IS NULL)
            OR (status NOT IN ('done','cancelled') AND completed_at IS NOT NULL)
            OR (reschedule_count < 0))
    + (SELECT count(*) FROM public.service_requests
         WHERE status='rescheduled'
           AND (rescheduled_from IS NULL OR reschedule_reason IS NULL OR length(trim(reschedule_reason))=0))
    + (SELECT count(*) FROM (SELECT 1 FROM public.tasks
         WHERE task_type='service_feedback' AND service_request_id IS NOT NULL
         GROUP BY service_request_id HAVING count(*)>1) a)
    + (SELECT count(*) FROM (SELECT 1 FROM public.service_requests
         WHERE previous_service_request_id IS NOT NULL
         GROUP BY previous_service_request_id HAVING count(*)>1) b)
    + (SELECT count(*) FROM public.service_requests sr JOIN public.service_plans sp ON sp.id=sr.service_plan_id
         WHERE sr.company_id IS NOT NULL AND sr.company_id<>sp.company_id)
    + (SELECT count(*) FROM public.service_requests sr JOIN public.service_requests p ON p.id=sr.previous_service_request_id
         WHERE sr.company_id IS NOT NULL AND p.company_id IS NOT NULL AND sr.company_id<>p.company_id)
    + (SELECT count(*) FROM public.tasks t JOIN public.service_requests sr ON sr.id=t.service_request_id
         WHERE t.company_id IS NOT NULL AND sr.company_id IS NOT NULL AND t.company_id<>sr.company_id)
    + (SELECT count(*) FROM public.service_events se JOIN public.service_requests sr ON sr.id=se.service_request_id
         WHERE se.company_id<>sr.company_id)
  INTO total;

  IF total > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT НЕ ПРОЙДЕН: обнаружено % проблемных строк — ENFORCE применять НЕЛЬЗЯ (см. детализацию выше)', total;
  END IF;
  RAISE NOTICE 'PREFLIGHT OK: 0 проблемных строк — можно готовить ENFORCE-миграцию';
END $$;

ROLLBACK;

\echo ''
\echo '============================================'
\echo 'PREFLIGHT ENFORCE завершён (read-only, rollback выполнен)'
\echo '============================================'
