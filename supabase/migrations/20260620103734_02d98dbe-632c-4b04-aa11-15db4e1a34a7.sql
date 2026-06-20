
-- Add new deal stage
ALTER TYPE deal_stage ADD VALUE IF NOT EXISTS 'installation' BEFORE 'won';

-- Auto-decrement stock + auto-create cartridge replacement task
CREATE OR REPLACE FUNCTION public.deals_automation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prod RECORD;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Stock decrement on transition into won or installation
  IF (OLD.stage IS DISTINCT FROM NEW.stage)
     AND NEW.stage IN ('won','installation')
     AND OLD.stage NOT IN ('won','installation') THEN
    SELECT * INTO prod FROM public.products WHERE id = NEW.product_id;
    IF FOUND AND prod.stock > 0 THEN
      UPDATE public.products SET stock = stock - 1 WHERE id = NEW.product_id;
    END IF;

    -- Auto-create cartridge replacement task on won + filter
    IF NEW.stage = 'won' AND prod.type = 'filter' THEN
      INSERT INTO public.tasks (title, description, status, client_id, due_at, created_by, assignee_id)
      VALUES (
        'Замена картриджей: ' || COALESCE(prod.name, ''),
        'Автозадача: связаться с клиентом для замены картриджей (сделка: ' || NEW.title || ')',
        'todo',
        NEW.client_id,
        now() + interval '180 days',
        NEW.owner_id,
        NEW.owner_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deals_automation ON public.deals;
CREATE TRIGGER trg_deals_automation
AFTER UPDATE ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.deals_automation();
