-- ═══════════════════════════════════════════════════════════════════
-- Migration: 005_satiya_behavioral_profiles.sql
-- Description: Create table for storing 8-Layer Personality analysis results
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS satiya_behavioral_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT,
  layer_scores JSONB NOT NULL, -- Holds detailed scores for Layer 1 to 8
  full_personality_score FLOAT NOT NULL,
  delta_report JSONB, -- Difference analysis between quiz baseline and chat behavior
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Disable RLS for easy anonymous client keys operation in sandbox
ALTER TABLE satiya_behavioral_profiles DISABLE ROW LEVEL SECURITY;
