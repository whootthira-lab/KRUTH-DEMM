-- Description: Create table for storing Live Match Telemetry for coach war room sessions
-- 1. Create table for live match telemetry
CREATE TABLE IF NOT EXISTS live_match_telemetry (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID REFERENCES group_sessions(id) ON DELETE CASCADE,
  group_number        INTEGER NOT NULL,
  current_minute      INTEGER NOT NULL DEFAULT 0,
  gold_difference     INTEGER NOT NULL DEFAULT 0,
  team_hero_ids       UUID[] DEFAULT '{}',
  opponent_hero_ids   UUID[] DEFAULT '{}',
  coach_id            UUID REFERENCES auth.users(id),
  chat_logs           JSONB DEFAULT '[]', -- Array of [{role: 'user'|'assistant', content: '...', timestamp: '...'}]
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, group_number)
);

-- 2. Enable Row Level Security
ALTER TABLE live_match_telemetry ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies allowing public / group coaches access
DROP POLICY IF EXISTS live_match_telemetry_policy ON live_match_telemetry;
CREATE POLICY live_match_telemetry_policy ON live_match_telemetry 
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND (
        is_super_admin = true OR 
        org_id = (SELECT org_id FROM group_sessions WHERE id = session_id)
      )
    )
  );

COMMENT ON TABLE live_match_telemetry IS 'Stores live match statistics, drafts, and coach strategy chat logs for real-time War Room.';
