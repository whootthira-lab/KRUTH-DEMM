-- ═══════════════════════════════════════════════════════════════════
-- Migration: 019_rov_knowledge_base.sql
-- Description: Create tables for RoV Esports Knowledge Base: heroes and items,
--              setup indexes, RLS, and seed key items.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Create table for RoV Heroes
CREATE TABLE IF NOT EXISTS rov_knowledge_heroes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_name_th     TEXT UNIQUE NOT NULL,
  hero_name_en     TEXT UNIQUE NOT NULL,
  primary_role     TEXT NOT NULL, -- Assassin, Mage, Fighter, Marksman, Tank, Support
  element_seed     JSONB NOT NULL, -- e.g. {"Fire": 0.6, "Wind": 0.4, "Earth": 0, "Water": 0, "Metal": 0}
  tactical_tags    TEXT[] NOT NULL, -- e.g. ['backline_diver', 'early_snowball', 'foresight_positioning']
  base_archetype   TEXT REFERENCES archetypes(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- 2. Create table for RoV Items
CREATE TABLE IF NOT EXISTS rov_knowledge_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name_th       TEXT UNIQUE NOT NULL,
  item_name_en       TEXT UNIQUE NOT NULL,
  item_type          TEXT NOT NULL, -- Attack, Defense, Magic, Move, Support
  stat_tags          TEXT[] NOT NULL, -- e.g. ['critical', 'armor_pierce', 'cd_reduction']
  psychology_fit_tag TEXT NOT NULL, -- 'HIGH_RISK_FULL_DAMAGE' or 'SAFE_PLAY_BRUISER'
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- 3. Extend group_simulations table if columns don't exist yet
ALTER TABLE group_simulations 
  ADD COLUMN IF NOT EXISTS selected_hero_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS opponent_hero_ids UUID[] DEFAULT '{}';

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_rov_heroes_role ON rov_knowledge_heroes(primary_role);
CREATE INDEX IF NOT EXISTS idx_rov_heroes_name ON rov_knowledge_heroes(hero_name_en);
CREATE INDEX IF NOT EXISTS idx_rov_items_fit ON rov_knowledge_items(psychology_fit_tag);
CREATE INDEX IF NOT EXISTS idx_rov_items_lookup ON rov_knowledge_items(item_name_en);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE rov_knowledge_heroes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rov_knowledge_items ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS Policies allowing public read-access
DROP POLICY IF EXISTS rov_heroes_read_policy ON rov_knowledge_heroes;
CREATE POLICY rov_heroes_read_policy ON rov_knowledge_heroes FOR SELECT USING (true);

DROP POLICY IF EXISTS rov_items_read_policy ON rov_knowledge_items;
CREATE POLICY rov_items_read_policy ON rov_knowledge_items FOR SELECT USING (true);

-- 7. Seed items into rov_knowledge_items
INSERT INTO rov_knowledge_items (item_name_th, item_name_en, item_type, stat_tags, psychology_fit_tag)
VALUES
  ('Gilded Greaves', 'Gilded Greaves', 'Move', ARRAY['magic_defense', 'resistance'], 'SAFE_PLAY_BRUISER'),
  ('Sonic Greaves', 'Sonic Greaves', 'Move', ARRAY['armor', 'normal_attack_block'], 'SAFE_PLAY_BRUISER'),
  ('Omni Arms', 'Omni Arms', 'Attack', ARRAY['physical_attack', 'attack_speed', 'critical', 'cd_reduction', 'lifesteal'], 'HIGH_RISK_FULL_DAMAGE'),
  ('Spear of Longinus', 'Spear of Longinus', 'Attack', ARRAY['physical_attack', 'cd_reduction', 'armor_pierce', 'defense_reduction'], 'SAFE_PLAY_BRUISER'),
  ('Shield of Lost', 'Shield of Lost', 'Defense', ARRAY['armor', 'max_hp', 'attack_speed_reduction'], 'SAFE_PLAY_BRUISER'),
  ('Fenrir\'s Tooth', 'Fenrir\'s Tooth', 'Attack', ARRAY['physical_attack', 'low_hp_damage_bonus'], 'HIGH_RISK_FULL_DAMAGE'),
  ('Muramasa', 'Muramasa', 'Attack', ARRAY['physical_attack', 'cd_reduction', 'armor_pierce_pct'], 'HIGH_RISK_FULL_DAMAGE'),
  ('Blade of Eternity', 'Blade of Eternity', 'Defense', ARRAY['armor', 'resurrection'], 'HIGH_RISK_FULL_DAMAGE')
ON CONFLICT (item_name_en) DO UPDATE 
SET item_name_th = EXCLUDED.item_name_th,
    item_type = EXCLUDED.item_type,
    stat_tags = EXCLUDED.stat_tags,
    psychology_fit_tag = EXCLUDED.psychology_fit_tag;

COMMENT ON TABLE rov_knowledge_heroes IS 'Stores RoV heroes metadata and element/psychology seeds.';
COMMENT ON TABLE rov_knowledge_items IS 'Stores RoV items metadata and psychological compatibility tags.';
