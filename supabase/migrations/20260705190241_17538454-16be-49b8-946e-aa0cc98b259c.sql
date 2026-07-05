ALTER TYPE public.hyla_lead_status ADD VALUE IF NOT EXISTS 'thinking';

ALTER TABLE public.hyla_leads
  ADD COLUMN IF NOT EXISTS next_contact_at TIMESTAMPTZ;

COMMENT ON COLUMN public.hyla_leads.next_contact_at IS
  'When to follow up with this lead next (set for callback/thinking outcomes after a demo, so no lead is silently forgotten).';

CREATE INDEX IF NOT EXISTS idx_hyla_leads_next_contact_at
  ON public.hyla_leads (next_contact_at);