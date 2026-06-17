-- Migration: 022_group_assignments_role.sql
-- Description: Add role column to group_assignments table for tracking subgroup member duties.

ALTER TABLE group_assignments ADD COLUMN IF NOT EXISTS role TEXT;

COMMENT ON COLUMN group_assignments.role IS 'The specific duty or role assigned to the member in this subgroup.';
