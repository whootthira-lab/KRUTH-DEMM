-- ═══════════════════════════════════════════════════════════════════
-- Migration: 004_satiya_chat_logs.sql
-- Description: Create table for storing Satiya AI Wellbeing Coach chat logs
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS satiya_chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  sender TEXT CHECK (sender IN ('user', 'assistant')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ปิดการใช้งาน RLS หรือสร้างนโยบายความปลอดภัยแบบสาธารณะเพื่อให้ Anon Key ทำงานได้อย่างราบรื่น
ALTER TABLE satiya_chat_logs DISABLE ROW LEVEL SECURITY;
