
DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash','transfer','installment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS payment_method payment_method,
  ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2) NOT NULL DEFAULT 0;

-- Replace automation: stock decrement & cartridge task on sale; auto-income tx for cash/transfer
CREATE OR REPLACE FUNCTION public.deals_automation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE prod RECORD;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  IF (OLD.stage IS DISTINCT FROM NEW.stage)
     AND NEW.stage IN ('sale','won','installation','test_install')
     AND OLD.stage NOT IN ('sale','won','installation','test_install') THEN
    SELECT * INTO prod FROM public.products WHERE id = NEW.product_id;
    IF FOUND AND prod.stock > 0 THEN
      UPDATE public.products SET stock = stock - 1 WHERE id = NEW.product_id;
    END IF;
  END IF;

  -- On transition into SALE: cartridge auto-task for filters + cash/transfer auto income
  IF (OLD.stage IS DISTINCT FROM NEW.stage) AND NEW.stage IN ('sale','won') THEN
    SELECT * INTO prod FROM public.products WHERE id = NEW.product_id;
    IF FOUND AND prod.type = 'filter' THEN
      INSERT INTO public.tasks (title, description, status, client_id, due_at, created_by, assignee_id)
      VALUES (
        'Замена картриджей: ' || COALESCE(prod.name,''),
        'Автозадача: связаться с клиентом для замены картриджей (сделка: ' || NEW.title || ')',
        'todo', NEW.client_id, now() + interval '180 days', NEW.owner_id, NEW.owner_id
      );
    END IF;

    IF NEW.payment_method IN ('cash','transfer') AND NEW.amount > 0
       AND NOT EXISTS (SELECT 1 FROM public.transactions WHERE deal_id = NEW.id AND type = 'income') THEN
      INSERT INTO public.transactions (type, amount, category, description, deal_id, created_by)
      VALUES ('income', NEW.amount,
              CASE NEW.payment_method WHEN 'cash' THEN 'Продажа (наличные)' ELSE 'Продажа (перевод)' END,
              'Авто: ' || NEW.title, NEW.id, NEW.owner_id);
      UPDATE public.deals SET paid_amount = NEW.amount, closed_at = COALESCE(closed_at, now())
        WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

-- When installment payment marked paid -> add income transaction & update deal paid_amount
CREATE OR REPLACE FUNCTION public.installment_payment_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE d_id uuid; cli_id uuid;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    SELECT deal_id, client_id INTO d_id, cli_id FROM public.installments WHERE id = NEW.installment_id;
    INSERT INTO public.transactions (type, amount, category, description, deal_id)
    VALUES ('income', NEW.amount, 'Рассрочка (платёж)',
            'Платёж от ' || to_char(NEW.due_date,'DD.MM.YYYY'), d_id);
    IF d_id IS NOT NULL THEN
      UPDATE public.deals SET paid_amount = paid_amount + NEW.amount WHERE id = d_id;
    END IF;
    -- Close installment if all paid
    IF NOT EXISTS (SELECT 1 FROM public.installment_payments
                   WHERE installment_id = NEW.installment_id AND status <> 'paid') THEN
      UPDATE public.installments SET status = 'completed' WHERE id = NEW.installment_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_installment_payment_paid ON public.installment_payments;
CREATE TRIGGER trg_installment_payment_paid
  AFTER UPDATE ON public.installment_payments
  FOR EACH ROW EXECUTE FUNCTION public.installment_payment_paid();

-- Mark installment as 'defaulted' when there are overdue unpaid payments (refresh on each query via view-like helper)
CREATE OR REPLACE FUNCTION public.refresh_installment_statuses()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  UPDATE public.installments i SET status = 'defaulted'
    WHERE status = 'active'
      AND EXISTS (SELECT 1 FROM public.installment_payments p
                  WHERE p.installment_id = i.id AND p.status <> 'paid' AND p.due_date < CURRENT_DATE);
  UPDATE public.installments i SET status = 'active'
    WHERE status = 'defaulted'
      AND NOT EXISTS (SELECT 1 FROM public.installment_payments p
                      WHERE p.installment_id = i.id AND p.status <> 'paid' AND p.due_date < CURRENT_DATE)
      AND EXISTS (SELECT 1 FROM public.installment_payments p
                  WHERE p.installment_id = i.id AND p.status <> 'paid');
$fn$;
