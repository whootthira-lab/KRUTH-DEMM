-- Migration: 030_add_full_name_to_org_admins.sql
-- Description: Add full_name column to org_admins table for forensic watermark identity.
--              Super Admin fills this when assigning admin rights.
--              Value is saved to localStorage and rendered in Dynamic Watermark overlay.

ALTER TABLE org_admins
  ADD COLUMN IF NOT EXISTS full_name TEXT;

-- ใส่ Comment อธิบายคอลัมน์
COMMENT ON COLUMN org_admins.full_name IS
  'ชื่อ-นามสกุลจริงของผู้ดูแลหน่วยงาน กรอกโดย Super Admin ตอนมอบสิทธิ์ ใช้แสดงในลายน้ำระบบนิติวิทยาศาสตร์ (Forensic Watermark)';
