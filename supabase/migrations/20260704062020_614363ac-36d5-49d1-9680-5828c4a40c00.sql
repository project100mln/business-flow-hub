CREATE TYPE public.hyla_lead_status AS ENUM (
  'new','quiz_done','operator_contacted','demo_scheduled','demo_done','callback','sale','refused'
);

CREATE TABLE public.hyla_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT,
  district TEXT,
  status public.hyla_lead_status NOT NULL DEFAULT 'new',
  operator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  score INTEGER NOT NULL DEFAULT 0,
  has_children BOOLEAN,
  has_allergy BOOLEAN,
  has_pets BOOLEAN,
  has_carpets BOOLEAN,
  has_mattresses BOOLEAN,
  has_odors BOOLEAN,
  air_quality_interest BOOLEAN,
  quiz_completed_at TIMESTAMPTZ,
  utm_source TEXT,
  utm_campaign TEXT,
  comment TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hyla_leads IS 'Leads captured for the HYLA vacuum cleaner ad campaign, with quiz-based scoring.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hyla_leads TO authenticated;
GRANT ALL ON public.hyla_leads TO service_role;

CREATE OR REPLACE FUNCTION public.calc_hyla_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE s INTEGER := 0;
BEGIN
  IF COALESCE(NEW.has_allergy, false) THEN s := s + 25; END IF;
  IF COALESCE(NEW.has_carpets, false) THEN s := s + 20; END IF;
  IF COALESCE(NEW.has_pets, false) THEN s := s + 15; END IF;
  IF COALESCE(NEW.has_children, false) THEN s := s + 15; END IF;
  IF COALESCE(NEW.air_quality_interest, false) THEN s := s + 15; END IF;
  IF COALESCE(NEW.has_mattresses, false) THEN s := s + 10; END IF;
  IF COALESCE(NEW.has_odors, false) THEN s := s + 10; END IF;
  NEW.score := LEAST(s, 100);

  IF NEW.quiz_completed_at IS NULL AND (
    NEW.has_children IS NOT NULL OR NEW.has_allergy IS NOT NULL OR NEW.has_pets IS NOT NULL OR
    NEW.has_carpets IS NOT NULL OR NEW.has_mattresses IS NOT NULL OR NEW.has_odors IS NOT NULL OR
    NEW.air_quality_interest IS NOT NULL
  ) THEN
    NEW.quiz_completed_at := now();
    IF NEW.status = 'new' THEN
      NEW.status := 'quiz_done';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_calc_hyla_score
  BEFORE INSERT OR UPDATE ON public.hyla_leads
  FOR EACH ROW EXECUTE FUNCTION public.calc_hyla_score();

ALTER TABLE public.hyla_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hyla_read" ON public.hyla_leads
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE POLICY "hyla_insert" ON public.hyla_leads
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "hyla_update" ON public.hyla_leads
  FOR UPDATE TO authenticated USING (
    operator_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
  );

CREATE POLICY "hyla_delete" ON public.hyla_leads
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
  );

CREATE INDEX idx_hyla_leads_status ON public.hyla_leads (status);
CREATE INDEX idx_hyla_leads_operator ON public.hyla_leads (operator_id);
CREATE INDEX idx_hyla_leads_created_at ON public.hyla_leads (created_at DESC);
CREATE INDEX idx_hyla_leads_score ON public.hyla_leads (score DESC);
CREATE INDEX idx_hyla_leads_city_district ON public.hyla_leads (city, district);
CREATE INDEX idx_hyla_leads_phone ON public.hyla_leads (phone);
CREATE INDEX idx_hyla_leads_status_created ON public.hyla_leads (status, created_at DESC);