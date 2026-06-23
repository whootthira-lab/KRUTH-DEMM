-- 033_add_accessibility_features.sql
-- เพิ่มคอลัมน์รองรับฟีเจอร์สิ่งอำนวยความสะดวกผู้พิการ (Accessibility Features)

-- 1. เพิ่มคอลัมน์เก็บลิงก์วิดีโอภาษามือสำหรับผู้บกพร่องทางการได้ยินในตาราง questions
ALTER TABLE questions ADD COLUMN IF NOT EXISTS sign_language_video_url TEXT;

COMMENT ON COLUMN questions.sign_language_video_url IS 'ลิงก์วิดีโอภาษามือ (.mp4) แสดงภาษามือแปลคำถาม เก็บใน Supabase Storage';

-- 2. เพิ่มคอลัมน์เก็บข้อมูลพฤติกรรมการพิมพ์/ตอบคำถามในระบบผู้บกพร่องทางการพูดในตาราง results
ALTER TABLE results ADD COLUMN IF NOT EXISTS behavioral_metrics JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN results.behavioral_metrics IS 'ข้อมูลพฤติกรรมการพิมพ์ ลบตัวอักษร และความหน่วงเวลาตอบสนอง ของผู้ใช้งาน';
