-- Add new roles to existing app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'installer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance';

-- ============ OBJECTS (B2B) ============
CREATE TABLE public.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_name text,
  bin text,
  address text,
  contact_person text,
  phone text,
  email text,
  notes text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.objects TO authenticated;
GRANT ALL ON public.objects TO service_role;
ALTER TABLE public.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read objects" ON public.objects FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff insert objects" ON public.objects FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff update objects" ON public.objects FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin delete objects" ON public.objects FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_objects_updated_at BEFORE UPDATE ON public.objects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SERVICE REQUESTS ============
CREATE TABLE public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  object_id uuid REFERENCES public.objects(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  issue text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  priority text NOT NULL DEFAULT 'normal',
  scheduled_at timestamptz,
  completed_at timestamptz,
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cost numeric(14,2) DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_requests TO authenticated;
GRANT ALL ON public.service_requests TO service_role;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read service" ON public.service_requests FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff insert service" ON public.service_requests FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff update service" ON public.service_requests FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin delete service" ON public.service_requests FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_service_updated_at BEFORE UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ INSTALLMENTS ============
CREATE TABLE public.installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  total_amount numeric(14,2) NOT NULL,
  down_payment numeric(14,2) NOT NULL DEFAULT 0,
  months integer NOT NULL DEFAULT 6,
  monthly_payment numeric(14,2) NOT NULL DEFAULT 0,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installments TO authenticated;
GRANT ALL ON public.installments TO service_role;
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read inst" ON public.installments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff insert inst" ON public.installments FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff update inst" ON public.installments FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin delete inst" ON public.installments FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_installments_updated_at BEFORE UPDATE ON public.installments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.installment_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id uuid NOT NULL REFERENCES public.installments(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  paid_at timestamptz,
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installment_payments TO authenticated;
GRANT ALL ON public.installment_payments TO service_role;
ALTER TABLE public.installment_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read inst pay" ON public.installment_payments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff insert inst pay" ON public.installment_payments FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff update inst pay" ON public.installment_payments FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin delete inst pay" ON public.installment_payments FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));