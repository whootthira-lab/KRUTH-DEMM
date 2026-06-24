-- 034_add_user_profile_fields.sql
-- เพิ่มคอลัมน์รองรับ อาชีพ ความถนัด และความสนใจ ของผู้ใช้งานในตาราง users

ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS special_skills TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS interests TEXT;

COMMENT ON COLUMN users.occupation IS 'อาชีพปัจจุบันของผู้ประเมิน';
COMMENT ON COLUMN users.special_skills IS 'ความถนัดหรือทักษะพิเศษของผู้ประเมิน';
COMMENT ON COLUMN users.interests IS 'ความสนใจส่วนตัวของผู้ประเมิน (เช่น ศิลปะ แฟชั่น)';
