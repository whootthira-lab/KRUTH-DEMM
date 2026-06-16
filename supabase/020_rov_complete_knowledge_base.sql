-- 1. สร้างตารางคลังข้อมูลรูนมาตรฐาน
CREATE TABLE IF NOT EXISTS rov_knowledge_runes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rune_color   TEXT NOT NULL, -- Red, Purple, Green
  rune_name_th TEXT UNIQUE NOT NULL,
  rune_name_en TEXT UNIQUE NOT NULL,
  stat_tags    TEXT[] NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 2. สร้างตารางคลังข้อมูลสกิลชาเลนเจอร์มาตรฐาน
CREATE TABLE IF NOT EXISTS rov_knowledge_skills (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_name_th TEXT UNIQUE NOT NULL,
  skill_name_en TEXT UNIQUE NOT NULL,
  tactical_tags TEXT[] NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rov_runes_lookup ON rov_knowledge_runes(rune_name_en);
CREATE INDEX IF NOT EXISTS idx_rov_skills_lookup ON rov_knowledge_skills(skill_name_en);

-- 3. Enable RLS
ALTER TABLE rov_knowledge_runes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rov_knowledge_skills ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies allowing public read-access
DROP POLICY IF EXISTS rov_runes_read_policy ON rov_knowledge_runes;
CREATE POLICY rov_runes_read_policy ON rov_knowledge_runes FOR SELECT USING (true);

DROP POLICY IF EXISTS rov_skills_read_policy ON rov_knowledge_skills;
CREATE POLICY rov_skills_read_policy ON rov_knowledge_skills FOR SELECT USING (true);

-- 5. SEED ข้อมูลรูนมาตรฐาน
INSERT INTO rov_knowledge_runes (rune_color, rune_name_th, rune_name_en, stat_tags) VALUES
('Red', 'ออนสลอต', 'Onslaught', ARRAY['armor_pierce', 'physical_damage']),
('Red', 'แรมเพจ', 'Rampage', ARRAY['high_crit', 'late_scaling']),
('Red', 'อะเวคเค่น', 'Awakened', ARRAY['attack_speed', 'crit_rate']),
('Red', 'ไวโอเลต', 'Violate', ARRAY['magic_damage', 'magic_pierce']),
('Purple', 'แอสซาซิเนท', 'Assassinate', ARRAY['high_mobility', 'physical_damage']),
('Purple', 'เกอริลลา', 'Guerrilla', ARRAY['high_mobility', 'attack_speed']),
('Purple', 'สปิริต', 'Spirit', ARRAY['high_mobility', 'magic_damage']),
('Purple', 'โพรเทค', 'Protect', ARRAY['sustain', 'max_hp']),
('Green', 'สคิวเวอร์', 'Skewer', ARRAY['armor_pierce']),
('Green', 'ดรากอน คลอว์', 'Dragon''s Claw', ARRAY['max_armor_pierce']),
('Green', 'ฟลูรี', 'Flurry', ARRAY['attack_speed', 'magic_pierce']),
('Green', 'แวลเลียนซี', 'Valiancy', ARRAY['max_hp', 'cooldown_reduction'])
ON CONFLICT (rune_name_en) DO UPDATE 
SET rune_color = EXCLUDED.rune_color,
    rune_name_th = EXCLUDED.rune_name_th,
    stat_tags = EXCLUDED.stat_tags;

-- 6. SEED ข้อมูลสกิลชาเลนเจอร์มาตรฐาน
INSERT INTO rov_knowledge_skills (skill_name_th, skill_name_en, tactical_tags) VALUES
('ปาป่า', 'Punish', ARRAY['jungle_clear', 'resource_gatherer']),
('ฟลิกเกอร์', 'Flicker', ARRAY['tower_dive', 'escape_mechanism', 'surprise_initiation']),
('ล้างสถานะ', 'Purify', ARRAY['cc_purify', 'survival_cushion']),
('ระเบิดพลัง', 'Execute', ARRAY['clean_up', 'burst_damage']),
('วิ่งเร็ว', 'Sprint', ARRAY['kite_mechanic', 'high_mobility']),
('ฮีล', 'Heal', ARRAY['team_heal', 'sustain_cushion']),
('คำราม', 'Roar', ARRAY['sustained_dps_buff', 'high_risk']),
('ปิดป้อม', 'Disrupt', ARRAY['tower_disabled', 'early_aggro_dive'])
ON CONFLICT (skill_name_en) DO UPDATE 
SET skill_name_th = EXCLUDED.skill_name_th,
    tactical_tags = EXCLUDED.tactical_tags;

-- 7. SEED หรืออัปเดตข้อมูลไอเทมมาตรฐานให้ครบถ้วน 20 ชิ้นใน rov_knowledge_items
INSERT INTO rov_knowledge_items (item_name_th, item_name_en, item_type, stat_tags, psychology_fit_tag) VALUES
('โซลรีฟเวอร์', 'Soulriever', 'Jungle', ARRAY['jungle_clear', 'burst_damage', 'cd_reduction'], 'HIGH_RISK_FULL_DAMAGE'),
('เลเวียธาน', 'Leviathan', 'Jungle', ARRAY['jungle_clear', 'max_hp', 'aoe_burn', 'sustain'], 'SAFE_PLAY_BRUISER'),
('กิลเด็ด กรีฟส์', 'Gilded Greaves', 'Move', ARRAY['cc_reduction', 'magic_defense', 'survival_cushion'], 'ALL_PROFILES'),
('โซนิค กรีฟส์', 'Sonic Greaves', 'Move', ARRAY['physical_defense', 'normal_attack_block'], 'ALL_PROFILES'),
('ออมนิ อาร์มส์', 'Omni Arms', 'Attack', ARRAY['passive_burst', 'multiplicative_scaling', 'lifesteal'], 'HIGH_RISK_FULL_DAMAGE'),
('เฟนริล ทูธ', 'Fenrir''s Tooth', 'Attack', ARRAY['max_damage', 'clean_up', 'execution_passive'], 'HIGH_RISK_FULL_DAMAGE'),
('แรงค์เบรกเกอร์', 'Rankbreaker', 'Attack', ARRAY['armor_pierce', 'early_scaling', 'movement_speed'], 'HIGH_RISK_FULL_DAMAGE'),
('หอกลองกินุส', 'Spear of Longinus', 'Attack', ARRAY['armor_shred', 'cooldown_reduction', 'max_hp'], 'SAFE_PLAY_BRUISER'),
('คลเลฟ ซานคติ', 'Claves Sancti', 'Attack', ARRAY['high_crit_rate', 'crit_damage_buff'], 'HIGH_RISK_FULL_DAMAGE'),
('สลิก สติง', 'Slikk''s Sting', 'Attack', ARRAY['attack_speed', 'crit_rate', 'cc_resistance_passive'], 'HIGH_RISK_FULL_DAMAGE'),
('ดิ เอจิส', 'The Aegis', 'Defense', ARRAY['cooldown_reduction', 'max_mana', 'attack_speed_slow_passive'], 'SAFE_PLAY_BRUISER'),
('โล่สูญสิ้น', 'Shield of the Lost', 'Defense', ARRAY['max_hp', 'physical_defense', 'aura_attack_speed_slow'], 'SAFE_PLAY_BRUISER'),
('เกอายา สแตนดาร์ด', 'Gaia''s Standard', 'Defense', ARRAY['magic_defense', 'max_hp', 'hp_regen_passive'], 'ALL_PROFILES'),
('เหรียญทรอย', 'Medallion of Troy', 'Defense', ARRAY['magic_defense', 'cooldown_reduction', 'magic_shield_passive'], 'ALL_PROFILES'),
('เกราะเกิด', 'Blade of Eternity', 'Defense', ARRAY['resurrection', 'armor', 'clutch_factor'], 'ALL_PROFILES'),
('บูมสติ๊ก', 'Boomstick', 'Magic', ARRAY['aoe_magic_burst', 'magic_power'], 'HIGH_RISK_FULL_DAMAGE'),
('มงกุฎเวท', 'Hecate''s Diadem', 'Magic', ARRAY['magic_power_percentage_buff', 'extreme_magic_power'], 'HIGH_RISK_FULL_DAMAGE'),
('โล่เวทดูดเลือด', 'Rhea''s Blessing', 'Magic', ARRAY['magic_lifesteal', 'magic_shield_passive', 'cooldown_reduction'], 'SAFE_PLAY_BRUISER'),
('เจาะเกราะเวท', 'Staff of Nuul', 'Magic', ARRAY['magic_armor_pierce_percentage', 'cooldown_reduction'], 'ALL_PROFILES'),
('เจเนซิส', 'Genesis', 'Support', ARRAY['team_armor_buff_aura', 'max_hp', 'movement_speed'], 'ALL_PROFILES')
ON CONFLICT (item_name_en) DO UPDATE 
SET item_name_th = EXCLUDED.item_name_th,
    item_type = EXCLUDED.item_type,
    stat_tags = EXCLUDED.stat_tags,
    psychology_fit_tag = EXCLUDED.psychology_fit_tag;
