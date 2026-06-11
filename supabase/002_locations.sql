-- KRUTH DEMM — Additional table: Locations (77 provinces)
-- รันหลังจาก 001_schema.sql

CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  region TEXT NOT NULL,
  province_th TEXT NOT NULL,
  province_en TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_locations_region ON locations(region);
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read locations" ON locations FOR SELECT USING (true);
