-- Migration: 028_multi_level_admin_roles.sql
-- Description: Alter org_admins check constraint to support 'coach' role and seed coach test user.

-- 1. Drop existing check constraint if it exists (usually named org_admins_role_check)
ALTER TABLE org_admins DROP CONSTRAINT IF EXISTS org_admins_role_check;

-- 2. Add updated check constraint to allow 'coach'
ALTER TABLE org_admins ADD CONSTRAINT org_admins_role_check CHECK (role IN ('org_admin', 'super_admin', 'coach'));

-- 3. Seed coach.dankhunthot@gmail.com as a Coach for สกร. ระดับอำเภอด่านขุนทด (org_code: SQR_DANKHUNTHOT)
INSERT INTO org_admins (org_id, email, role)
SELECT id, 'coach.dankhunthot@gmail.com', 'coach'
FROM organizations
WHERE org_code = 'SQR_DANKHUNTHOT'
ON CONFLICT (email) 
DO UPDATE SET role = 'coach';
