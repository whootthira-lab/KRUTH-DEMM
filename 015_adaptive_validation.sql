-- ═══════════════════════════════════════════════════════════════════
-- KRUTH DEMM — Adaptive Validation Loop
-- Migration: 015_adaptive_validation.sql
-- Platform: D + Satiya + NAVA + VERA
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Quick Assessments ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quick_assessments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT REFERENCES users(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL,
  -- คนที่ถูกพูดถึง (ไม่เก็บชื่อ)
  target_role      TEXT NOT NULL,
  target_desc      TEXT,
  -- คำตอบ 3-5 ข้อ
  q1_answer        TEXT,
  q2_answer        TEXT,
  q3_answer        TEXT,
  q4_answer        TEXT,
  q5_answer        TEXT,
  -- ผล estimate
  estimated_quad   TEXT,
  estimated_jung   TEXT,
  estimated_via    TEXT,
  -- Compat
  calc_compat      FLOAT,
  user_felt_compat FLOAT,
  compat_delta     FLOAT GENERATED ALWAYS AS
    (CASE WHEN user_felt_compat IS NOT NULL
          THEN user_felt_compat - calc_compat
          ELSE NULL END) STORED,
  -- Context
  situation_type   TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qa_user ON quick_assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_qa_platform ON quick_assessments(platform);
CREATE INDEX IF NOT EXISTS idx_qa_role ON quick_assessments(target_role);

-- ── 2. Advice Outcomes ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS advice_outcomes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT REFERENCES users(id) ON DELETE CASCADE,
  quick_assessment_id UUID REFERENCES quick_assessments(id),
  checklist_id        UUID,
  theory_used         TEXT NOT NULL,
  platform            TEXT NOT NULL,
  -- วันที่ check-in (3/7/14/30)
  check_day           INT NOT NULL,
  -- ผลลัพธ์
  tried               BOOLEAN,
  outcome_score       INT CHECK (outcome_score BETWEEN 1 AND 5),
  relationship_delta  INT CHECK (relationship_delta BETWEEN -2 AND 2),
  what_worked         TEXT,
  what_failed         TEXT,
  barrier_to_try      TEXT,
  -- การเปลี่ยนแปลงของผู้ใช้เอง
  user_mindset_shift  BOOLEAN,
  user_changed_desc   TEXT,
  -- Theory effectiveness
  theory_effective    BOOLEAN,
  next_theory         TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ao_user ON advice_outcomes(user_id);
CREATE INDEX IF NOT EXISTS idx_ao_theory ON advice_outcomes(theory_used);
CREATE INDEX IF NOT EXISTS idx_ao_day ON advice_outcomes(check_day);

-- ── 3. Compat Validations ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compat_validations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT REFERENCES users(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL,
  -- ประเภทตัวอย่าง
  pair_type        TEXT NOT NULL
    CHECK (pair_type IN ('best_match','worst_match','counter_example','neutral')),
  -- Quad & Jung pair
  user_quad        TEXT,
  target_quad      TEXT,
  user_jung        TEXT,
  target_jung      TEXT,
  user_via         TEXT,
  target_via       TEXT,
  -- คะแนน
  calc_compat      FLOAT,
  actual_compat    FLOAT CHECK (actual_compat BETWEEN 0 AND 1),
  delta            FLOAT GENERATED ALWAYS AS
    (CASE WHEN actual_compat IS NOT NULL
          THEN actual_compat - calc_compat
          ELSE NULL END) STORED,
  -- เหมือน/ต่าง flags
  is_same_quad     BOOLEAN,
  is_same_jung     BOOLEAN,
  is_same_via      BOOLEAN,
  -- Mindset ที่ผู้ใช้รายงาน
  mindset_type     TEXT
    CHECK (mindset_type IN ('similar_works','different_works',
                            'similar_fails','different_fails','unknown')),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cv_user ON compat_validations(user_id);
CREATE INDEX IF NOT EXISTS idx_cv_pair ON compat_validations(pair_type);
CREATE INDEX IF NOT EXISTS idx_cv_quads ON compat_validations(user_quad, target_quad);

-- ── 4. Validation Insights (System-level Learning) ───────────────
CREATE TABLE IF NOT EXISTS validation_insights (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_type     TEXT NOT NULL,
  affected_pairs   TEXT[],
  layer            TEXT,
  calc_avg         FLOAT,
  actual_avg       FLOAT,
  bias_direction   TEXT
    CHECK (bias_direction IN ('over_estimate','under_estimate','accurate')),
  sample_count     INT DEFAULT 0,
  recommendation   TEXT,
  status           TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','reviewed','applied','rejected')),
  applied_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── 5. Mindset Tracking ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mindset_tracking (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT REFERENCES users(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL,
  -- คำถาม mindset (VAL-5)
  adapt_philosophy TEXT
    CHECK (adapt_philosophy IN ('change_self','understand_both','change_other','unknown')),
  similar_mindset  TEXT,
  different_mindset TEXT,
  key_insight_th   TEXT,
  -- เปลี่ยนแปลงหรือไม่
  prev_snapshot    JSONB,
  assessed_at      TIMESTAMPTZ DEFAULT now()
);

-- ── 6. Check-in Schedule ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checkin_schedule (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT REFERENCES users(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL,
  advice_outcome_trigger_id UUID,
  scheduled_day    INT NOT NULL,
  scheduled_at     TIMESTAMPTZ NOT NULL,
  sent_at          TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  status           TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','sent','completed','skipped')),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_user ON checkin_schedule(user_id);
CREATE INDEX IF NOT EXISTS idx_cs_status ON checkin_schedule(status);
CREATE INDEX IF NOT EXISTS idx_cs_scheduled ON checkin_schedule(scheduled_at);

-- ── 7. Views ──────────────────────────────────────────────────────

-- Theory effectiveness summary
CREATE OR REPLACE VIEW theory_effectiveness_summary AS
SELECT
  theory_used,
  platform,
  check_day,
  COUNT(*) AS total_samples,
  COUNT(*) FILTER (WHERE tried = true) AS tried_count,
  ROUND(AVG(outcome_score) FILTER (WHERE tried = true), 2) AS avg_outcome,
  ROUND(AVG(relationship_delta) FILTER (WHERE tried = true), 2) AS avg_rel_delta,
  COUNT(*) FILTER (WHERE theory_effective = true) AS effective_count,
  ROUND(
    COUNT(*) FILTER (WHERE theory_effective = true)::FLOAT /
    NULLIF(COUNT(*) FILTER (WHERE tried = true), 0) * 100, 1
  ) AS effectiveness_pct
FROM advice_outcomes
GROUP BY theory_used, platform, check_day
ORDER BY effectiveness_pct DESC NULLS LAST;

-- Compat calibration needs
CREATE OR REPLACE VIEW compat_calibration_needs AS
SELECT
  user_quad || '-' || target_quad AS quad_pair,
  user_jung || '-' || target_jung AS jung_pair,
  COUNT(*) AS sample_count,
  ROUND(AVG(calc_compat), 3) AS avg_calc,
  ROUND(AVG(actual_compat), 3) AS avg_actual,
  ROUND(AVG(delta), 3) AS avg_delta,
  CASE
    WHEN AVG(delta) > 0.15 THEN 'under_estimate — เพิ่มค่า matrix'
    WHEN AVG(delta) < -0.15 THEN 'over_estimate — ลดค่า matrix'
    ELSE 'accurate'
  END AS calibration_status
FROM compat_validations
WHERE actual_compat IS NOT NULL
GROUP BY user_quad, target_quad, user_jung, target_jung
HAVING COUNT(*) >= 5
ORDER BY ABS(AVG(delta)) DESC;

-- ── Comments ──────────────────────────────────────────────────────
COMMENT ON TABLE quick_assessments IS
  'ผลการประเมิน 3-5Q สำหรับคนที่ผู้ใช้พูดถึง — ใช้ estimate Quad/Jung/VIA';
COMMENT ON TABLE advice_outcomes IS
  'ติดตามผลหลังให้คำแนะนำ Day 3/7/14/30 — ใช้วัด theory effectiveness';
COMMENT ON TABLE compat_validations IS
  'ผลการ validate สมการ Compat กับความเป็นจริงที่ผู้ใช้รายงาน';
COMMENT ON TABLE validation_insights IS
  'บทเรียนระดับระบบ — ใช้ calibrate matrix เมื่อ n เพียงพอ';
COMMENT ON TABLE mindset_tracking IS
  'ติดตาม mindset ของผู้ใช้เกี่ยวกับการปรับตัวและความเข้ากันได้';
COMMENT ON TABLE checkin_schedule IS
  'ตารางนัด check-in อัตโนมัติ — Vercel Cron อ่านทุก 6 ชั่วโมง';

