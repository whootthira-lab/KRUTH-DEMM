-- ═══════════════════════════════════════════════════════════════════
-- Migration: 016_satiya_router_logs.sql
-- Description: Create table for storing Router AI routing and weight decisions,
--              and add applied_weights field to satiya_behavioral_profiles.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS satiya_router_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT,
  context_type TEXT,
  safety_override BOOLEAN DEFAULT false,
  confidence_score FLOAT,
  raw_router_weights JSONB, -- The raw weights from Router AI
  applied_weights JSONB,     -- Normalized & momentum-adjusted weights
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Disable Row Level Security (RLS) for consistency with satiya_behavioral_profiles
ALTER TABLE satiya_router_logs DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_router_user ON satiya_router_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_router_created_at ON satiya_router_logs(created_at);

-- Add applied_weights column to satiya_behavioral_profiles if it does not already exist
ALTER TABLE satiya_behavioral_profiles ADD COLUMN IF NOT EXISTS applied_weights JSONB;

COMMENT ON TABLE satiya_router_logs IS 'Logs Router AI context routing, safety overrides, and weights for Mixture-of-Psychological-Experts.';
