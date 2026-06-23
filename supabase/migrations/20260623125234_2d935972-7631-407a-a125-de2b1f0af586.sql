
-- Coordinator role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coordinator';

-- Enums
DO $$ BEGIN
  CREATE TYPE public.contact_type AS ENUM ('cold','recommendation','instagram','site','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.call_status AS ENUM ('new','queued','connected','no_answer','callback','refused','interested','install_scheduled','passed_to_coordinator');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.install_request_status AS ENUM ('new','awaiting_master','sent_to_master','accepted','rejected','completed','rescheduled','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.master_response AS ENUM ('pending','accepted','rejected','no_response');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- База обзвона
CREATE TABLE public.cold_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL,
  source text,
  contact_type public.contact_type NOT NULL DEFAULT 'cold',
  status public.call_status NOT NULL DEFAULT 'new',
  assigned_operator uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  comment text,
  next_contact_at timestamptz,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cold_contacts TO authenticated;
GRANT ALL ON public.cold_contacts TO service_role;
ALTER TABLE public.cold_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cc_read" ON public.cold_contacts FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "cc_insert" ON public.cold_contacts FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "cc_update" ON public.cold_contacts FOR UPDATE TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "cc_delete" ON public.cold_contacts FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE TRIGGER trg_cc_updated BEFORE UPDATE ON public.cold_contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- История звонков
CREATE TABLE public.call_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.cold_contacts(id) ON DELETE CASCADE,
  operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  called_at timestamptz NOT NULL DEFAULT now(),
  result public.call_status NOT NULL,
  comment text,
  recording_url text,
  next_step text,
  next_contact_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_history TO authenticated;
GRANT ALL ON public.call_history TO service_role;
ALTER TABLE public.call_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ch_read" ON public.call_history FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "ch_insert" ON public.call_history FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "ch_update" ON public.call_history FOR UPDATE TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "ch_delete" ON public.call_history FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));

-- Заявки на установку (отдельно от installations — координация мастеров)
CREATE TABLE public.install_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.cold_contacts(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  phone text NOT NULL,
  address text,
  district text,
  geo_lat numeric,
  geo_lng numeric,
  desired_at timestamptz,
  operator_comment text,
  equipment_type text,
  status public.install_request_status NOT NULL DEFAULT 'new',
  master_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  master_response public.master_response NOT NULL DEFAULT 'pending',
  master_response_at timestamptz,
  sent_to_master_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.install_requests TO authenticated;
GRANT ALL ON public.install_requests TO service_role;
ALTER TABLE public.install_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ir_read" ON public.install_requests FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "ir_insert" ON public.install_requests FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "ir_update" ON public.install_requests FOR UPDATE TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "ir_delete" ON public.install_requests FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE TRIGGER trg_ir_updated BEFORE UPDATE ON public.install_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
