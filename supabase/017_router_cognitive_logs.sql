-- ═══════════════════════════════════════════════════════════════════
-- Migration: 017_router_cognitive_logs.sql
-- Description: Create table for storing Router AI dialogue strategy decisions,
--              chosen scenarios, and psychometric snapshots.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS router_cognitive_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        TEXT, -- Holds the Satiya chat session identifier
  user_id           TEXT NOT NULL,
  user_message      TEXT,
  context_type      TEXT NOT NULL, -- morality, relationship, decision, emotion, conflict, etc.
  chosen_strategy   TEXT NOT NULL, -- PROGRESSIVE_CLARIFICATION, ADAPTIVE_TONE, etc.
  applied_weights   JSONB NOT NULL, -- Applied momentum weights {w1, w2, ..., w8}
  scores_snapshot   JSONB NOT NULL, -- Raw psychological scores {S1, S2, ..., S8}
  final_score       FLOAT NOT NULL,
  safety_triggered  BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Disable Row Level Security (RLS) for anonymous access in sandbox
ALTER TABLE router_cognitive_logs DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_router_cog_session_date ON router_cognitive_logs(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_router_cog_user ON router_cognitive_logs(user_id);

COMMENT ON TABLE router_cognitive_logs IS 'Stores cognitive logs and weight snapshorts from the Hybrid DM Router.';
