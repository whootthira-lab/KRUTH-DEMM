-- ═══════════════════════════════════════════════════════════════════
-- Migration: 007_super_admin.sql
-- Description: Alter org_admins table to support roles and seed whootthira@gmail.com as super admin
-- ═══════════════════════════════════════════════════════════════════

-- 1. Add role column to org_admins table if it doesn't exist yet
ALTER TABLE org_admins 
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'org_admin' CHECK (role IN ('org_admin', 'super_admin'));

-- 2. Seed whootthira@gmail.com as a Super Admin (no specific org_id)
INSERT INTO org_admins (email, role, org_id)
VALUES ('whootthira@gmail.com', 'super_admin', NULL)
ON CONFLICT (email) 
DO UPDATE SET role = 'super_admin', org_id = NULL;

-- 3. Also make sure the organizations RLS or key constraints allow super admins to perform operations
-- If we want to assign other admin emails, let's verify that org_admins is writable
ALTER TABLE org_admins DISABLE ROW LEVEL SECURITY;
