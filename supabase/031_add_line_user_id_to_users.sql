-- Migration: 031_add_line_user_id_to_users.sql
-- Description: Add line_user_id to users and create satiya_chat_states to support Satiya LINE OA chatbot integration.

-- 1. เพิ่ม line_user_id ในตาราง users เพื่อจดจำและผูกบัญชี LINE
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS line_user_id TEXT UNIQUE;

COMMENT ON COLUMN users.line_user_id IS 'LINE User ID ของผู้ใช้งานที่เชื่อมต่อกับระบบรายงานผลประเมินจิตวิทยา';

-- 2. สร้างตารางเก็บสถานะการสนทนาของโค้ชซาติยะสำหรับแต่ละผู้ใช้ข้ามเซสชัน
CREATE TABLE IF NOT EXISTS satiya_chat_states (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE satiya_chat_states IS 'เก็บสถานะความคืบหน้าการสนทนา (เช่น Toxic Workplace diagnostic progress) ของโค้ชซาติยะ';

-- 3. ปิด RLS เพื่อความสะดวกในการสืบค้นหลังบ้านผ่านระบบไร้สิทธิ์การระบุตัวตนฝั่ง LINE API
ALTER TABLE satiya_chat_states DISABLE ROW LEVEL SECURITY;
