-- Migration: 027_custom_scenario_registry.sql
-- Description: Database Schema for Dynamic Scenario Registry Builder

CREATE TABLE IF NOT EXISTS custom_scenario_registry (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  creator_id                TEXT NOT NULL,
  scenario_name             TEXT NOT NULL,
  project_type              TEXT NOT NULL,         -- e.g., 'esports_rov', 'corporate_crisis'
  telemetry_constraints     JSONB NOT NULL DEFAULT '{}'::jsonb,        -- e.g., {"gold_diff": -3000, "distance": 800}
  voice_constraints         JSONB NOT NULL DEFAULT '{}'::jsonb,        -- e.g., {"keywords": ["ถอย", "ไม่ไหว"], "vvi_ceiling": 3.8}
  ai_output_macro_script    TEXT NOT NULL,         -- Strategy recommendations or macro script
  is_active                 BOOLEAN DEFAULT true,
  created_at                TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by active organization and project type
CREATE INDEX IF NOT EXISTS idx_custom_scenarios_active ON custom_scenario_registry(org_id, project_type) WHERE is_active = true;

-- Disable RLS to allow direct client queries (consistent with other tables in KRUTH-DEMM schema)
ALTER TABLE custom_scenario_registry DISABLE ROW LEVEL SECURITY;

-- Seed default scenarios for all existing organizations
INSERT INTO custom_scenario_registry (org_id, creator_id, scenario_name, project_type, telemetry_constraints, voice_constraints, ai_output_macro_script, is_active)
SELECT 
  id as org_id,
  'system' as creator_id,
  'SC-001: โดนล่อออกนอกฐาน (Baiting Trap)' as scenario_name,
  'esports_rov' as project_type,
  '{"gold_diff_limit": 1500, "out_of_base_depth": 500}'::jsonb as telemetry_constraints,
  '{"keywords": ["เลือดน้อย", "ตามได้", "ไล่ๆ"], "vvi_floor": 3.5}'::jsonb as voice_constraints,
  '🔘 สั่งดึงจังหวะถอยคุมพื้นที่ | คำเตือน: ศัตรูหายไปจากแผนที่ 3 ตัว เสี่ยงโดนล่อซุ่มโจมตี' as ai_output_macro_script,
  true as is_active
FROM organizations
ON CONFLICT DO NOTHING;

INSERT INTO custom_scenario_registry (org_id, creator_id, scenario_name, project_type, telemetry_constraints, voice_constraints, ai_output_macro_script, is_active)
SELECT 
  id as org_id,
  'system' as creator_id,
  'SC-002: แยกกันเดินจนโดนเก็บ (Sequential Pick-offs)' as scenario_name,
  'esports_rov' as project_type,
  '{"avg_member_distance": 800, "death_interval_seconds": 20}'::jsonb as telemetry_constraints,
  '{"keywords": ["ช่วยด้วย", "ไม่ทัน"], "silent_tilt_enabled": true}'::jsonb as voice_constraints,
  '🔘 สั่งรวมกลุ่มคุมเลนกลาง | คำเตือน: รูปเกมกระจายตัวเกินเกณฑ์ปลอดภัย บังคับส่งสัญญาณสลับมาเดินคู่' as ai_output_macro_script,
  true as is_active
FROM organizations
ON CONFLICT DO NOTHING;

INSERT INTO custom_scenario_registry (org_id, creator_id, scenario_name, project_type, telemetry_constraints, voice_constraints, ai_output_macro_script, is_active)
SELECT 
  id as org_id,
  'system' as creator_id,
  'SC-003: ลังเลสู้ไม่สุดจนเพื่อนตาย (Hesitation Split-Decision)' as scenario_name,
  'esports_rov' as project_type,
  '{"conflicting_dash_move_ratio": 0.8}'::jsonb as telemetry_constraints,
  '{"keywords": ["เข้า", "ถอย"], "concurrent_conflict_seconds": 1.0}'::jsonb as voice_constraints,
  '🔘 สั่งให้ถอยเซฟแนวหลัง | บันทึกสถิติ: เพิ่มดัชนีความย้อนแย้งทางปริชานในคลังพัฒนาการระยะยาว' as ai_output_macro_script,
  true as is_active
FROM organizations
ON CONFLICT DO NOTHING;
