-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  type text NOT NULL DEFAULT 'info',
  related_task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX notifications_user_unread_idx
  ON public.notifications (user_id, read_at, created_at DESC);

CREATE UNIQUE INDEX notifications_task_type_unique
  ON public.notifications (related_task_id, type)
  WHERE related_task_id IS NOT NULL;

-- Function: create reminders 7 days before due_at for cartridge tasks
CREATE OR REPLACE FUNCTION public.notify_upcoming_cartridge_tasks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  WITH ins AS (
    INSERT INTO public.notifications (user_id, title, body, type, related_task_id)
    SELECT
      COALESCE(t.assignee_id, t.created_by) AS user_id,
      'Скоро: ' || t.title AS title,
      'Срок выполнения через ~7 дней (' || to_char(t.due_at, 'DD.MM.YYYY') || ').' AS body,
      'cartridge_reminder' AS type,
      t.id
    FROM public.tasks t
    WHERE t.title ILIKE 'Замена картриджей%'
      AND t.status <> 'done'
      AND t.due_at IS NOT NULL
      AND t.due_at::date BETWEEN (now()::date + 6) AND (now()::date + 8)
      AND COALESCE(t.assignee_id, t.created_by) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.related_task_id = t.id AND n.type = 'cartridge_reminder'
      )
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM ins;
  RETURN inserted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_upcoming_cartridge_tasks() FROM PUBLIC, anon, authenticated;

-- Schedule daily run at 09:00 UTC
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN
  PERFORM cron.unschedule('notify-cartridge-tasks-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'notify-cartridge-tasks-daily',
  '0 9 * * *',
  $$ SELECT public.notify_upcoming_cartridge_tasks(); $$
);