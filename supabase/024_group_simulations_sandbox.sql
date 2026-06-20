-- Migration: 024_group_simulations_sandbox.sql
-- Description: v3.5 Database Schema Expansion for Sandbox, Passkeys, Forensic Audit, and Deterministic Blurred Views

-- 1. อัปเดตตารางบันทึกแผนร่างจำลองกลุ่มย่อย (Sandbox Metadata)
ALTER TABLE group_simulations 
ADD COLUMN IF NOT EXISTS is_draft_sandbox BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS locked_positions JSONB DEFAULT '{}'::jsonb;

-- 2. สร้างตารางบันทึกกุญแจสาธารณะ Passkeys ของผู้บริหาร (WebAuthn Credentials)
CREATE TABLE IF NOT EXISTS user_passkey_credentials (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,
  credential_id       TEXT UNIQUE NOT NULL,
  public_key          TEXT NOT NULL,
  counter             INT DEFAULT 0,
  device_name         TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_lookup ON user_passkey_credentials(user_id);

-- 3. สร้างตารางเก็บบันทึกหลักฐานดิจิทัลทางนิติวิทยาศาสตร์ (Forensic Audit Trail)
CREATE TABLE IF NOT EXISTS executive_privacy_audit_logs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executive_id            TEXT NOT NULL,
  org_id                  UUID REFERENCES organizations(id) ON DELETE CASCADE,
  target_member_id        TEXT, -- บันทึก ID เป้าหมายหากเป็นการกดคลิกดูแบบเจาะลึกรายบุคคล
  access_granted_to       TEXT NOT NULL DEFAULT 'INDIVIDUAL_WELLBEING_PANEL',
  ip_address              TEXT NOT NULL,
  user_agent              TEXT NOT NULL,
  digital_signature_hash  TEXT NOT NULL, -- ลายนิ้วมือดิจิทัลเข้ารหัสแฮช HMAC-SHA256
  created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_privacy_audit_forensics ON executive_privacy_audit_logs(executive_id, org_id, created_at DESC);

-- 4. เปิดใช้งานกลไก ROW LEVEL SECURITY (RLS) แยกแยะข้อมูลข้าม B2B Tenant เด็ดขาด
ALTER TABLE user_passkey_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE executive_privacy_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS passkey_owner_access_policy ON user_passkey_credentials;
CREATE POLICY passkey_owner_access_policy ON user_passkey_credentials
  FOR ALL USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS super_admin_forensic_policy ON executive_privacy_audit_logs;
CREATE POLICY super_admin_forensic_policy ON executive_privacy_audit_logs
  FOR SELECT USING ((SELECT is_super_admin FROM users WHERE id = auth.uid()::text) = true);

-- 5. สร้างโครงสร้างมุมมองสลัวมหาภาคสำหรับบัญชีโค้ช (Blurred View for Coach)
-- ใช้ระบบ Deterministic Pseudo-Random Noise โดยนำ org_id มาหลอมรวมเข้ากับ current_date เพื่อแก้ปัญหา Score Jitter
CREATE OR REPLACE VIEW coach_team_vulnerability_snapshot AS
WITH group_members_with_slots AS (
  SELECT 
    ga.session_id,
    ga.group_number,
    ga.user_id,
    ROW_NUMBER() OVER (PARTITION BY ga.session_id, ga.group_number ORDER BY ga.user_id) AS id_slot,
    COALESCE(r.score_n, 3.0) AS current_tilt_score,
    COALESCE(r.score_c * 20.0, 60.0) AS current_focus_stability_score
  FROM group_assignments ga
  LEFT JOIN results r ON r.user_id = ga.user_id
)
SELECT 
  gs.org_id,
  (GREATEST(
    MAX(CASE WHEN gms.id_slot = 1 THEN gms.current_tilt_score END),
    MAX(CASE WHEN gms.id_slot = 2 THEN gms.current_tilt_score END),
    MAX(CASE WHEN gms.id_slot = 3 THEN gms.current_tilt_score END),
    MAX(CASE WHEN gms.id_slot = 4 THEN gms.current_tilt_score END),
    MAX(CASE WHEN gms.id_slot = 5 THEN gms.current_tilt_score END)
  ) + ((('x' || substring(md5(gs.org_id::text || CURRENT_DATE::text) from 1 for 8))::bit(32)::int::numeric / 4294967295.0 * 0.1) - 0.05)) AS macro_team_vulnerability_index,
  AVG(gms.current_focus_stability_score) AS team_global_focus_stability_percentage,
  NOW() as calculated_at
FROM live_match_telemetry lmt
JOIN group_sessions gs ON gs.id = lmt.session_id
JOIN group_members_with_slots gms ON gms.session_id = lmt.session_id AND gms.group_number = lmt.group_number
GROUP BY gs.org_id;
