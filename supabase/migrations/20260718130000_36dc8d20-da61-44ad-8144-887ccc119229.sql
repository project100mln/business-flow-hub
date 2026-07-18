-- ============================================================
-- OrbitOS: разбиваем модуль "leads" на два отдельных
--   hyla_leads  — раздел "HYLA лиды" (/app/hyla)
--   cold_calls  — раздел "База обзвона" (/app/calls)
-- Только данные: правим дефолт колонки и существующие строки.
-- ============================================================

-- 1. Новый дефолт для будущих компаний
ALTER TABLE public.companies
  ALTER COLUMN enabled_modules SET DEFAULT '[
    "hyla_leads","cold_calls","clients","objects","deals","tasks","service",
    "installations","installments","warehouse","finance","staff","owner"
  ]'::jsonb;

-- 2. Существующие компании: заменяем "leads" на два новых ключа,
--    остальные модули и их порядок не трогаем. Идемпотентно — при
--    повторном запуске ничего не делает, т.к. "leads" уже не осталось.
UPDATE public.companies
SET enabled_modules = (enabled_modules - 'leads') || '["hyla_leads","cold_calls"]'::jsonb
WHERE enabled_modules ? 'leads';
