-- Migration: 025_fix_rls_passkeys_audit.sql
-- Description: Disable RLS on user_passkey_credentials and executive_privacy_audit_logs to prevent authorization blocks for custom localStorage admin sessions

-- Disable RLS since server-side API routes handle all cryptographic verification and signing
ALTER TABLE user_passkey_credentials DISABLE ROW LEVEL SECURITY;
ALTER TABLE executive_privacy_audit_logs DISABLE ROW LEVEL SECURITY;

-- Drop obsolete policies to avoid clutter
DROP POLICY IF EXISTS passkey_owner_access_policy ON user_passkey_credentials;
DROP POLICY IF EXISTS super_admin_forensic_policy ON executive_privacy_audit_logs;
