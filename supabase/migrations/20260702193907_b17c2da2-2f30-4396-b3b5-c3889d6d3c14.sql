
-- Extend call_status enum with new labels used by call-base module
ALTER TYPE public.call_status ADD VALUE IF NOT EXISTS 'queued';
ALTER TYPE public.call_status ADD VALUE IF NOT EXISTS 'connected';
ALTER TYPE public.call_status ADD VALUE IF NOT EXISTS 'no_answer';
ALTER TYPE public.call_status ADD VALUE IF NOT EXISTS 'install_scheduled';
ALTER TYPE public.call_status ADD VALUE IF NOT EXISTS 'passed_to_coordinator';
