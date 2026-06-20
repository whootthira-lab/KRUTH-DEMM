-- Migration: 029_audit_logs_advanced_security.sql
-- Description: Expand executive_privacy_audit_logs table to store action_type, target_resource_id, and metadata for advanced forensic audit tracking.

ALTER TABLE executive_privacy_audit_logs 
  ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT 'VIEW',
  ADD COLUMN IF NOT EXISTS target_resource_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN executive_privacy_audit_logs.action_type IS 'Type of auditing action: VIEW, DOWNLOAD, COPY_ATTEMPT, UNAUTHORIZED_BLUR, etc.';
COMMENT ON COLUMN executive_privacy_audit_logs.target_resource_id IS 'Specific target ID, e.g., member ID, file name, or report section';
COMMENT ON COLUMN executive_privacy_audit_logs.metadata IS 'Flexible JSON container for audit metadata, such as file size, exported page, IP geolocation, etc.';
