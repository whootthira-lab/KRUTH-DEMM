-- ═══════════════════════════════════════════════════════════════════
-- Migration: 006_executive_auth.sql
-- Description: Create org_admins table and seed admin for สกร. ระดับอำเภอด่านขุนทด
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS org_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ปิดการใช้งาน RLS หรือสร้างนโยบายความปลอดภัยแบบสาธารณะเพื่อให้ Anon Key ทำงานได้อย่างราบรื่น
ALTER TABLE org_admins DISABLE ROW LEVEL SECURITY;

-- ป้อนข้อมูลแอดมินเริ่มต้นสำหรับ สกร. ระดับอำเภอด่านขุนทด (org_code: SQR_DANKHUNTHOT)
INSERT INTO org_admins (org_id, email)
SELECT id, 'dole.dankhunthot@gmail.com'
FROM organizations
WHERE org_code = 'SQR_DANKHUNTHOT'
ON CONFLICT (email) DO NOTHING;
