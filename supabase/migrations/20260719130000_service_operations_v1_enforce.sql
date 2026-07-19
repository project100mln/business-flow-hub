-- ============================================================
-- OrbitOS: SERVICE OPERATIONS V1 — ФАЗА ENFORCE
-- Включает СТРОГИЕ бизнес-правила. Применять ТОЛЬКО ПОСЛЕ выкладки
-- нового фронтенда (иначе старый app.service.tsx начнёт падать на
-- завершении/продвижении заявок).
--
-- ENFORCE НЕ меняет и НЕ удаляет существующие данные и объекты:
-- это один CREATE OR REPLACE функции public.service_request_before_update()
-- + повторная (идемпотентная) привязка BEFORE UPDATE-триггера.
-- Правила срабатывают только на БУДУЩИЕ INSERT/UPDATE, старые строки не трогаются.
-- ============================================================

-- ============================================================
-- ДИАГНОСТИКА (запустить ВРУЧНУЮ ДО применения этой миграции).
-- Показывает уже существующие строки, которые НЕ соответствовали бы новым
-- правилам, ЕСЛИ бы их статус меняли новым UI. Триггер их не переписывает —
-- это только предупреждение. Автоисправление НЕ делается (нужно отдельное
-- разрешение). Те же запросы есть в service_operations_v1_enforce_verify.sql.
--
--   -- (a) завершённые заявки без resolution (их нельзя будет «пере-завершить»):
--   SELECT id, company_id, status, completed_at
--   FROM public.service_requests
--   WHERE status = 'done' AND (resolution IS NULL OR length(trim(resolution)) = 0);
--
--   -- (b) заявки в статусах, которых нет в новом FSM (перевести их можно будет
--   --     только по правилам нового графа):
--   SELECT id, company_id, status, count(*) OVER () AS total
--   FROM public.service_requests
--   WHERE status NOT IN ('new','callback','scheduled','confirmed','assigned',
--                        'en_route','arrived','in_progress','problem',
--                        'rescheduled','done','cancelled');
--
--   -- (c) сколько заявок в «старых» промежуточных статусах, чувствительных к FSM:
--   SELECT status, count(*) FROM public.service_requests GROUP BY status ORDER BY 2 DESC;
-- ============================================================

-- ============================================================
-- Строгая версия BEFORE UPDATE. Полностью заменяет мягкую версию из EXPAND.
-- Реагирует ТОЛЬКО на смену статуса — редактирование заметок/суммы/даты без
-- смены статуса (в т.ч. у завершённых заявок) по-прежнему проходит.
-- ============================================================
CREATE OR REPLACE FUNCTION public.service_request_before_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE ok boolean;
BEGIN
  -- Нет смены статуса — ничего не проверяем и не блокируем.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Терминальные статусы нельзя возвращать в работу.
  IF OLD.status IN ('done','cancelled') THEN
    RAISE EXCEPTION 'service: статус "%" терминальный — переход в "%" запрещён', OLD.status, NEW.status;
  END IF;

  -- Разрешённые переходы нового FSM.
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

  -- Автозаполнение временных меток (как в EXPAND).
  IF NEW.status = 'confirmed'   AND NEW.confirmed_at IS NULL THEN NEW.confirmed_at := now(); END IF;
  IF NEW.status = 'en_route'    AND NEW.departed_at  IS NULL THEN NEW.departed_at  := now(); END IF;
  IF NEW.status = 'arrived'     AND NEW.arrived_at   IS NULL THEN NEW.arrived_at   := now(); END IF;
  IF NEW.status = 'in_progress' AND NEW.started_at   IS NULL THEN NEW.started_at   := now(); END IF;

  -- Завершение требует resolution.
  IF NEW.status = 'done' THEN
    IF NEW.resolution IS NULL OR length(trim(NEW.resolution)) = 0 THEN
      RAISE EXCEPTION 'service: нельзя завершить заявку без описания результата (resolution)';
    END IF;
    IF NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
    NEW.feedback_due_at := NEW.completed_at + interval '1 day';
  END IF;

  -- Перенос требует новую дату и причину.
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

-- Идемпотентная гарантия: BEFORE UPDATE-триггер привязан именно к этой функции.
DROP TRIGGER IF EXISTS trg_service_before_update ON public.service_requests;
CREATE TRIGGER trg_service_before_update BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.service_request_before_update();

-- ============================================================
-- ENFORCE готово. Данные не изменялись; включены только правила на будущее.
-- ============================================================
