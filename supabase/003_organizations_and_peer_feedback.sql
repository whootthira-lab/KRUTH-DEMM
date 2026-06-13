-- ═══════════════════════════════════════════════════════════════════
-- PART 1: Organizations & Subgroup Peer Feedback
-- ═══════════════════════════════════════════════════════════════════

-- 1. ตาราง Organizations และข้อมูลเริ่มต้น
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  org_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;

-- ป้อนข้อมูลเริ่มต้น (Seed Data)
INSERT INTO organizations (name, org_code)
VALUES 
  ('สกร. ระดับอำเภอด่านขุนทด', 'SQR_DANKHUNTHOT'),
  ('โรงเรียนบุญเหลือวิทยานุสรณ์', 'BYS_BOONYUATR')
ON CONFLICT (org_code) DO NOTHING;


-- 2. ตารางเชื่อมโยงสมาชิกองค์กร
CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  line_user_id TEXT,
  role TEXT DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, user_id)
);

ALTER TABLE org_members DISABLE ROW LEVEL SECURITY;


-- 3. ตารางบันทึกการจับกลุ่มย่อย (2-3 คน) โดยผู้ควบคุม
CREATE TABLE IF NOT EXISTS group_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  session_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE group_sessions DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS group_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES group_sessions(id) ON DELETE CASCADE,
  group_number INT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, user_id)
);

ALTER TABLE group_assignments DISABLE ROW LEVEL SECURITY;


-- 4. ตารางคัดกรองปฏิสัมพันธ์แบบแชตบอต (Conversational Peer Feedback)
-- สร้างตารางใหม่ถ้ายังไม่มี และเพิ่มโครงสร้างคอลัมน์ของทั้งระบบใหม่และระบบประเมินบทบาทภายนอกเดิมเพื่อให้รองรับร่วมกันได้
CREATE TABLE IF NOT EXISTS quick_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE, -- ID ผู้ประเมิน
  target_user_id TEXT REFERENCES users(id) ON DELETE CASCADE, -- ID เพื่อนในกลุ่ม
  session_id UUID REFERENCES group_sessions(id) ON DELETE CASCADE,
  platform TEXT, -- รองรับระบบประเมินบทบาทเดิม (เช่น boss, colleague)
  target_role TEXT, -- รองรับระบบประเมินบทบาทเดิม
  target_desc TEXT, -- รองรับระบบประเมินบทบาทเดิม
  q1_answer TEXT, -- คำตอบข้อ 1
  q2_answer TEXT, -- คำตอบข้อ 2
  q3_answer TEXT, -- คำตอบข้อ 3
  q4_answer TEXT, -- รองรับคำตอบข้อ 4 เดิม
  q5_answer TEXT, -- รองรับคำตอบข้อ 5 เดิม
  estimated_quad TEXT, -- ขั้วพฤติกรรมที่คำนวณได้
  estimated_jung TEXT, -- บุคลิกภาพยุงเกียนที่คำนวณได้
  estimated_via TEXT, -- รองรับค่าจุดเด่นเดิม
  calc_compat FLOAT, -- คะแนนเข้ากันได้ทางทฤษฎี (15-98%)
  user_felt_compat FLOAT, -- คะแนนความพึงพอใจจริง (1-5)
  compat_delta FLOAT GENERATED ALWAYS AS (user_felt_compat - calc_compat) STORED, -- ค่าความคลาดเคลื่อน
  situation_type TEXT, -- รองรับข้อมูลบริบทเดิม
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE quick_assessments DISABLE ROW LEVEL SECURITY;

-- ในกรณีที่ตาราง quick_assessments มีอยู่ก่อนหน้านี้แล้ว (เช่น จากสคริปต์ 015 เดิมที่รันไปแล้ว) 
-- ให้ใช้คำสั่งนี้เพื่อเพิ่มคอลัมน์ใหม่สำหรับระบบจัดกลุ่มย่อยป้องกันความผิดพลาด
ALTER TABLE quick_assessments 
  ADD COLUMN IF NOT EXISTS target_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES group_sessions(id) ON DELETE CASCADE;


-- ═══════════════════════════════════════════════════════════════════
-- PART 2: Satiya KWI (เตรียมโครงสร้างฐานข้อมูลล่วงหน้า)
-- ═══════════════════════════════════════════════════════════════════

-- 5. ตารางบันทึกผลการประเมินสุขภาวะ KWI (Satiya KWI Responses)
CREATE TABLE IF NOT EXISTS kwi_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  responses_jsonb JSONB NOT NULL,
  vitality FLOAT,
  meaning FLOAT,
  connection FLOAT,
  mastery FLOAT,
  resilience FLOAT,
  kwi_total FLOAT,
  wellbeing_pattern TEXT,
  peak_hour TEXT,
  coping_style TEXT,
  personal_year TEXT,
  taken_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE kwi_responses DISABLE ROW LEVEL SECURITY;

-- 6. ตารางบันทึกสถิติรายเดือนสุขภาวะ KWI (Satiya KWI Temporal)
CREATE TABLE IF NOT EXISTS kwi_temporal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  snapshot_month TEXT,
  vitality_avg FLOAT,
  meaning_avg FLOAT,
  connection_avg FLOAT,
  mastery_avg FLOAT,
  resilience_avg FLOAT,
  kwi_total_avg FLOAT,
  pattern TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE kwi_temporal DISABLE ROW LEVEL SECURITY;

-- 7. ตารางสะพานเชื่อมโยง DEMM Archetypes กับ Satiya KWI Patterns
CREATE TABLE IF NOT EXISTS demm_kwi_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archetype_id TEXT REFERENCES archetypes(id) ON DELETE CASCADE,
  pattern_id TEXT NOT NULL,
  insight_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(archetype_id, pattern_id)
);

ALTER TABLE demm_kwi_matrix DISABLE ROW LEVEL SECURITY;
