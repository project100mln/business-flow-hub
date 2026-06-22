
-- Extend deal_stage enum with new business flow values
ALTER TYPE deal_stage ADD VALUE IF NOT EXISTS 'client';
ALTER TYPE deal_stage ADD VALUE IF NOT EXISTS 'test_install';
ALTER TYPE deal_stage ADD VALUE IF NOT EXISTS 'using';
ALTER TYPE deal_stage ADD VALUE IF NOT EXISTS 'decision';
ALTER TYPE deal_stage ADD VALUE IF NOT EXISTS 'dismantle';
ALTER TYPE deal_stage ADD VALUE IF NOT EXISTS 'sale';

-- Extend install_status with test and dismantled
ALTER TYPE install_status ADD VALUE IF NOT EXISTS 'test';
ALTER TYPE install_status ADD VALUE IF NOT EXISTS 'dismantled';
