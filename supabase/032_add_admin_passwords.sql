-- Migration: 032_add_admin_passwords.sql
-- Description: Add password hashing and first-time setup token columns to org_admins, and add trigger to reset passwords on admin modifications.

-- 1. Add columns to org_admins
ALTER TABLE org_admins
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_salt TEXT,
  ADD COLUMN IF NOT EXISTS password_setup_token UUID UNIQUE DEFAULT gen_random_uuid();

-- 2. Create function to manage password resets
CREATE OR REPLACE FUNCTION fn_on_org_admin_upsert()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.password_hash := NULL;
    NEW.password_salt := NULL;
    NEW.password_setup_token := gen_random_uuid();
  ELSIF TG_OP = 'UPDATE' THEN
    -- If administrative fields are altered, invalidate password and require setup
    IF NEW.email IS DISTINCT FROM OLD.email OR
       NEW.role IS DISTINCT FROM OLD.role OR
       NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      NEW.password_hash := NULL;
      NEW.password_salt := NULL;
      NEW.password_setup_token := gen_random_uuid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create trigger
DROP TRIGGER IF EXISTS trg_reset_admin_password ON org_admins;
CREATE TRIGGER trg_reset_admin_password
  BEFORE INSERT OR UPDATE ON org_admins
  FOR EACH ROW
  EXECUTE FUNCTION fn_on_org_admin_upsert();
