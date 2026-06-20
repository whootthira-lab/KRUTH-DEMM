-- Migration: 026_activity_evaluations_chat_insights.sql
-- Description: v3.5 Database Expansion for Audio Intelligence, Manual Activity Logger, and Chat Insights

-- 1. ตารางบันทึกการประเมินกิจกรรมหน้างานรายบุคคลด้วยมือ (Manual Activity Logger)
CREATE TABLE IF NOT EXISTS member_activity_evaluations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID REFERENCES group_sessions(id) ON DELETE CASCADE,
  user_id             TEXT NOT NULL,
  evaluator_id        TEXT NOT NULL,
  activity_name       VARCHAR(100) NOT NULL,
  performance_rating  NUMERIC(2,1) DEFAULT 3.0,
  qualitative_notes   TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_eval_lookup ON member_activity_evaluations(session_id, user_id);

-- 2. ตารางบันทึกข้อมูลอินไซต์จิตวิทยาที่สกัดพบในช่องแชตผู้บริหาร (AI Chat Insights)
CREATE TABLE IF NOT EXISTS executive_chat_insights (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID REFERENCES organizations(id) ON DELETE CASCADE,
  target_user_id      TEXT NOT NULL,
  insight_tag         VARCHAR(50) NOT NULL, -- e.g., 'conflict_risk', 'burnout_warning'
  confidence_score    NUMERIC(3,2) NOT NULL,
  context_excerpt     TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_insight_lookup ON executive_chat_insights(org_id, target_user_id);

-- 3. ตารางอนุกรมเวลาบันทึกสัญญาณเสียงและสภาวะอารมณ์ระหว่างแข่ง (Voice & Emotional Time-Series Logs)
CREATE TABLE IF NOT EXISTS member_emotional_time_series (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID REFERENCES group_sessions(id) ON DELETE CASCADE,
  group_number        INT NOT NULL,
  user_id             TEXT NOT NULL,
  game_time_seconds   INT NOT NULL,
  arousal_score       NUMERIC(3,2) NOT NULL,
  valence_score       NUMERIC(3,2) NOT NULL,
  vvi_volatility      NUMERIC(3,2) NOT NULL,
  predicted_state     VARCHAR(20) NOT NULL, -- 'TILT', 'HYPE', 'CALM', 'DEJECTED'
  last_game_event     VARCHAR(50) DEFAULT 'FARMING',
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emo_time_series_lookup ON member_emotional_time_series(session_id, user_id, game_time_seconds DESC);

-- Disable Row Level Security to prevent authorization blocks for anonymous client requests
ALTER TABLE member_activity_evaluations DISABLE ROW LEVEL SECURITY;
ALTER TABLE executive_chat_insights DISABLE ROW LEVEL SECURITY;
ALTER TABLE member_emotional_time_series DISABLE ROW LEVEL SECURITY;
