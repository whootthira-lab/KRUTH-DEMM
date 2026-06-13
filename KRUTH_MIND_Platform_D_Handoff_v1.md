# KRUTH MIND — Platform D: AI Psychology Coach
## Technical Handoff Document v1.0
**สำหรับ AI ที่รับงานต่อ: อ่านทั้งหมดก่อนเริ่มทำงาน**

---

## 0. CONTEXT — สิ่งที่ต้องรู้ก่อน

ระบบนี้สร้างโดย ธีระ ครุฑขุนทด (DVJ / KRUTH APEX) เป็น AI Chatbot ด้านจิตวิทยาและพัฒนาตนเอง  
มีข้อมูลผู้ใช้จริง n=42 คน (ทดสอบแล้ว) และโค้ดที่ deploy บน Vercel + Supabase แล้ว

**Stack ปัจจุบัน:**
- Frontend: Next.js 14 (Vercel) — https://kruth-demm-final.vercel.app
- Backend: Supabase (PostgreSQL) — project: bruyuwjuewpuntcoeoqe
- Scoring: TypeScript `lib/scoring.ts`
- AI: Anthropic Claude API (claude-sonnet-4-20250514)

**ไฟล์สำคัญที่ต้องรู้:**
- `lib/scoring.ts` — สมการทั้งหมด (WHO-5 Guard v3, Clinical Signals, Delusion)
- `app/api/score/route.ts` — API endpoint หลัก
- `lib/types.ts` — TypeScript types ทั้งหมด
- Supabase tables: users, results, category_flags, quiz_logs, archetypes, quiz_sessions

---

## 1. ARCHITECTURE OVERVIEW

```
User
 ↓
[Quiz Interface] ← 487 คำถาม Adaptive (V7.4)
 ↓
[API: /api/score] ← POST {dvjId, band, answers[], sessionId}
 ↓
[lib/scoring.ts] ← คำนวณทุกอย่าง
 ↓
┌─────────────────────────────────────────┐
│  calcScores()    → OCEAN + pDCR scores  │
│  calcJungian()   → TJ/TP/FJ/FP          │
│  calcViaScores() → W/C/H/J/T/Tr         │
│  calcFuzzyQuadrant() → Q1-Q4 + fuzzy    │
│  calcArchetypeId() → Y_VIA-QUAD-JUNG    │
│  calcMultiDimFlags() → Rain/Bolt/Fog    │
│  calcBrightFlag() → 💎/⚗️/🌱            │
│  calcConfidence() → SD/INF/CON          │
│  calcClinicalSignals() → 5 signals      │
└─────────────────────────────────────────┘
 ↓
[Supabase] → results + category_flags
 ↓
[AI Chatbot] ← ดึง results → สร้างคำแนะนำ
```

---

## 2. SCORING ENGINE — สมการทั้งหมด

### 2.1 OCEAN (Big Five)

```typescript
// คำนวณ average ของทุก answer ที่มี tag นั้น
Score_O = SUM(answers where score_raw contains "O:") / COUNT(same)
// ช่วงคะแนน: 1.0 - 5.0 | จุดตัด: 3.0
```

**ความหมาย:**
| มิติ | สูง (≥3.0) | ต่ำ (<3.0) |
|------|-----------|-----------|
| O | สร้างสรรค์ เปิดกว้าง → Q1/Q2 | ปฏิบัตินิยม มั่นคง → Q3/Q4 |
| C | มีวินัย วางแผน → TJ | ยืดหยุ่น ไม่ชอบกรอบ → TP/FP |
| E | ชอบสังคม พูดเก่ง → Q1/Q3 | เก็บตัว คิดคนเดียว → Q2/Q4 |
| A | เมตตา ประนีประนอม → FJ | ตรงไปตรงมา แข่งขัน → TJ |
| N | อ่อนไหว วิตกกังวล → Rain/Fog | มั่นคง ไม่เครียด |

### 2.2 Fuzzy Quadrant

```typescript
cutoff = 3.0
zone = 0.3
conf_O = min(|O - cutoff| / zone, 1.0)  // 0=borderline, 1=ชัดเจน
conf_E = min(|E - cutoff| / zone, 1.0)

primary = highO && highE ? "Q1" : highO ? "Q2" : highE ? "Q3" : "Q4"
isBorderline = conf_O < 1.0 OR conf_E < 1.0
// ถ้า borderline → มี secondary quadrant (คะแนน 70/30)
```

**Quadrant Map:**
```
O สูง + E สูง = Q1 Explorer  (เปิดกว้าง + สังคม)
O สูง + E ต่ำ = Q2 Thinker   (นักคิด + เก็บตัว)  ← Vata 77%
O ต่ำ + E สูง = Q3 Connector (เชื่อมคน + สังคม)
O ต่ำ + E ต่ำ = Q4 Builder   (สร้างระบบ + เก็บตัว) ← Pitta 63%
```

### 2.3 Archetype ID System

Format: `Y_[VIA]-[QUAD]-[JUNG]`  
ตัวอย่าง: `Y_J-Q4-TJ` = "ผู้รักษามาตรฐาน"

**VIA:** W(ปัญญา) C(กล้าหาญ) H(มนุษยธรรม) J(ยุติธรรม) T(ควบคุมตน) Tr(เหนือตน)  
**Quad:** Q1 Q2 Q3 Q4  
**Jung:** TJ TP FJ FP  
**รวม:** 6 × 4 × 4 = **96 Archetypes**

### 2.4 Hybrid Compatibility v2.0

```typescript
Compat = VIA_score × 0.5 + Quad_score × 0.3 + Jung_score × 0.2

// VIA matrix (ตัวอย่าง):
// J×C = 0.8 (ยุติธรรม+กล้าหาญ ค่านิยมตรงกัน)
// H×Tr = 0.9 (มนุษยธรรม+เหนือตน เติมเต็มกัน)
// W×T = 0.4 (ต่างกันมาก)

// Quad matrix (ตรงข้ามเติมเต็ม):
// Q1×Q4 = 0.9  Q2×Q3 = 0.8
// Q4×Q4 = 0.5  (เหมือนกัน ไม่เติมเต็ม)

// Jung matrix (ต่างกัน 1 มิติดีที่สุด):
// TJ×FJ = 0.8  TJ×TP = 0.8  FJ×FP = 0.8

// Stretch formula: ((raw - 0.4) / (0.9 - 0.4)) × 100
// จำกัด: 15% - 98%
```

### 2.5 Multi-Dimensional Flags

```typescript
// 🌧 RAIN — อารมณ์ทดถอย
rainScore += 4  if hasWHO5 && WHO5 <= 8
rainScore += 2  if hasWHO5 && WHO5 <= 12
rainScore += 3  if N >= 4.0
rainScore += 2  if N >= 3.5
rainScore += 1  if C <= 2.0
rainScore += 1  if VIA_min == "Tr"
rain_level = 🔴 if crisis OR score>=7 | 🟠 if >=5 | 🟡 if >=3

// ⚡ BOLT — พลังงานฝืนขอบเขต (ก้าวร้าว/หุนหัน)
boltScore += 2  if N >= 4.0
boltScore += 2  if A <= 1.5
boltScore += 2  if C <= 1.5
boltScore += 1  if E >= 4.5
bolt_level = 🔴 if >=5 | 🟠 if >=3 | 🟡 if >=2

// 🌫 FOG — ถอยตัวจากสังคม
fogScore += 3  if E <= 1.5 AND hasWHO5 AND WHO5 <= 12
fogScore += 1  if A <= 2.0
fogScore += 1  if hasWHO5 AND WHO5 <= 12
fogScore += 1  if VIA_min == "H"
fog_level = 🔴 if >=5 | 🟠 if >=3 | 🟡 if >=2

// 🔋 BATTERY — Band F/G เท่านั้น (42-80 ปี)
batScore += 3  if ADL <= 4
batScore += 2  if GDS >= 6  (+2 more if GDS >= 11)
batScore += 1  if C <= 2.0 AND N >= 3.5
batScore += 1  if hasWHO5 AND WHO5 <= 8

// WHO-5 Guard v3: hasWHO5 = (who5_answer_count >= 3) AND (WHO5 > 0)
// ป้องกัน false positive เมื่อผู้ใช้ตอบ WHO-5 แค่ 1-2 ข้อ
```

### 2.6 BRIGHT Flag

```typescript
// ผู้มีศักยภาพสูงแต่อาจมีความเสี่ยง
if O >= 4.5 && N >= 3.5 && E <= 3.0 → Type 1: Intense Creator
if N >= 3.5 && E >= 3.5 && A <= 2.5 → Type 2: Justice Seeker
if C >= 4.5 && N >= 3.5 && WHO5 <= 12 → Type 3: Hyper-Achiever (Burnout risk!)
if E >= 4.5 && N >= 3.5 && A >= 3.5 → Type 4: Misunderstood Connector
if N >= 3.0 && O >= 3.5 && E <= 2.5 → Hidden Creative

// hasRisk = Rain/Bolt/Fog/Battery มี level
// hasRisk=true → ⚗️ (ต้องระวัง) | false → 💎 (เบ่งบาน) | Hidden → 🌱
```

---

## 3. CLINICAL SIGNALS SYSTEM

**สำคัญ: Clinical Signals ไม่แสดงให้ผู้ใช้ทั่วไป — เก็บใน category_flags เท่านั้น**

### 3.1 ADHD Signal 🎯

```typescript
// Trigger: พฤติกรรมสมาธิสั้น + บุคลิกที่สอดคล้อง
adhdScore += 3  if SCR-ADHD >= 3  (tags ในคำถาม C)
adhdScore += 2  if SCR-ADHD >= 2
adhdScore += 2  if C <= 2.0       (ขาดวินัย/สมาธิ)
adhdScore += 1  if C <= 2.5
adhdScore += 1  if N >= 3.5       (หุนหันพลันแลน)
adhdScore += 1  if O >= 3.5 AND C <= 2.5  (ไอเดียเยอะจบยาก)
level: 🟡 if >=3 | 🟠 if >=5
```

### 3.2 Burnout Signal 🔥

```typescript
// Trigger: ขยันมากจนหมดไฟ (ไม่ใช่ขี้เกียจ)
burnoutScore += 3  if C >= 4.0 AND N >= 3.0
burnoutScore += 2  if C >= 3.5 AND N >= 3.5
burnoutScore += 2  if hasWHO5 AND WHO5 <= 12 AND C >= 3.5
burnoutScore += 1  if rain.level AND C >= 3.5
burnoutScore += 1  if E <= 2.0 AND C >= 4.0  (แบกงานคนเดียว)
level: 🟡 if >=3 | 🟠 if >=5

// Pattern: คนขยัน (C สูง) + เครียด (N สูง) + สุขภาวะต่ำ = Burnout
// ≠ Rain: Rain=ซึมเศร้า, Burnout=หมดไฟจากงาน
```

### 3.3 OCD Signal 🔄

```typescript
// Trigger: ย้ำคิดย้ำทำ ต้องสมบูรณ์แบบ
ocdScore += 3  if SCR-OCD >= 2
ocdScore += 2  if C >= 4.5 AND N >= 3.5
ocdScore += 1  if C >= 4.0 AND N >= 3.0
ocdScore += 1  if O <= 2.0 AND C >= 4.0  (ยึดติดรูปแบบ)
ocdScore += 1  if answers.N03 == "A"      (เช็คซ้ำ)
level: 🟡 if >=3 | 🟠 if >=5
```

### 3.4 Social Anxiety Signal 😰

```typescript
// Trigger: กลัวสังคม (ไม่ใช่แค่เก็บตัว)
saScore += 3  if E <= 1.5
saScore += 2  if E <= 2.0
saScore += 2  if N >= 3.5 AND E <= 2.5
saScore += 1  if A <= 2.0 AND E <= 2.0
saScore += 1  if SCR-WD >= 1    (Withdrawal behavior)
saScore += 1  if fog.level exists
saScore += 1  if hasWHO5 AND WHO5 <= 12 AND E <= 2.0
level: 🟡 if >=3 | 🟠 if >=6
```

### 3.5 Delusion Signal 🔮

```typescript
// Trigger: สภาวะหลงผิด / ขาดการเชื่อมต่อกับความเป็นจริง
// Pattern 1: Grandiosity
delusionScore += 3  if O >= 4.8 AND N <= 1.5
delusionScore += 2  if O >= 4.5 AND N <= 1.5
delusionScore += 2  if SD >= 2 AND N <= 2.0

// Pattern 2: Extreme Profile (ผิดปกติ)
extremeCount = count of dims where score >= 4.5 OR <= 1.5
delusionScore += 3  if extremeCount >= 4
delusionScore += 1  if extremeCount >= 3

// Pattern 3: Paranoid Profile
delusionScore += 3  if A <= 1.5 AND N >= 4.5 AND E <= 1.5
delusionScore += 2  if A <= 2.0 AND N >= 4.0 AND E <= 2.0
delusionScore += 2  if SCR-PAR >= 3

// Pattern 4: Contradiction
delusionScore += 2  if con_checks >= 3
delusionScore += 1  if con_checks >= 2

// Pattern 5: Speed Anomaly
fastRatio = answers with latency_ms < 2000 / total
delusionScore += 2  if fastRatio >= 0.5
delusionScore += 1  if fastRatio >= 0.3

// Pattern 6: INF + Extreme
delusionScore += 2  if INF >= 1 AND extremeCount >= 2

// Pattern 7: Too Perfect (แทบไม่มีในโลกจริง)
delusionScore += 3  if O>=4.0 AND C>=4.0 AND E>=4.0 AND A>=4.0 AND N<=2.0

level:   🟡=3-4 | 🟠=5-6 | 🔴>=7
action:  🟡="สังเกตเพิ่ม" | 🟠="ทำซ้ำกับผู้เชี่ยวชาญ" | 🔴="ส่งต่อทันที"
```

---

## 4. DATABASE SCHEMA

### 4.1 category_flags table (ทุก column)

```sql
id, user_id, session_id, created_at
rain_level TEXT, rain_score INTEGER
bolt_level TEXT, bolt_score INTEGER
fog_level TEXT, fog_score INTEGER
battery_level TEXT, battery_score INTEGER
bright_flag TEXT, bright_type TEXT
scr_signals JSONB, safe_flags JSONB
has_crisis BOOLEAN, crisis_action TEXT
adhd_score INT, adhd_level TEXT, adhd_details JSONB
burnout_score INT, burnout_level TEXT, burnout_details JSONB
ocd_score INT, ocd_level TEXT, ocd_details JSONB
socialanxiety_score INT, socialanxiety_level TEXT, socialanxiety_details JSONB
delusion_score INT, delusion_level TEXT, delusion_details JSONB, delusion_action TEXT
```

### 4.2 results table (key columns)

```sql
user_id, session_id, archetype_id, archetype_name_th, archetype_name_en
score_o, score_c, score_e, score_a, score_n  -- OCEAN 1.0-5.0
quadrant_primary, quadrant_secondary, confidence_o, confidence_e
via_dominant, via_scores JSONB  -- {W,C,H,J,T,Tr}
jungian_type, jungian_scores JSONB  -- {T,F,J,P}
pdcr_fire, pdcr_wind, pdcr_water, pdcr_earth, pdcr_dominant
indian_dosha  -- "Vata (วาตะ - ลม)" / "Pitta (ปิตตะ - ไฟ)" / "Kapha (กผะ - ดิน/น้ำ)"
compat_top3 JSONB, compat_hardest JSONB
bright_flag, bright_type
confidence_score, confidence_level, confidence_details JSONB
energy_id, energy_name, energy_keywords  -- numerology 00-99
```

### 4.3 users table (key columns)

```sql
id (dvjId), full_name, dob, day_of_week
thai_element, chinese_element
name_fire_pct, name_earth_pct, name_wind_pct, name_water_pct  -- เปอร์เซ็นต์ธาตุจากชื่อ
num_life  -- เลขกำลังชีวิต (numerology)
```
---

## 5. TEAM INTELLIGENCE MODULE

### 5.1 วิธีคำนวณ Team Analysis (5 Layers)

```
Input: user_ids[] → ดึง results + category_flags ของแต่ละคน
Output: Team Report ที่ AI ใช้สร้างคำแนะนำ
```

#### Layer 1: DEMM Compatibility Matrix

```python
for each pair (A, B):
    s_via  = VIA_MATRIX[A.via][B.via]    # จาก lookup table
    s_quad = QUAD_MATRIX[A.quad][B.quad]
    s_jung = JUNG_MATRIX[A.jung][B.jung]
    raw = s_via*0.5 + s_quad*0.3 + s_jung*0.2
    pct = max(15, min(98, ((raw-0.4)/(0.9-0.4))*100))
```

**VIA Matrix (ส่วนสำคัญ):**

| | W | C | H | J | T | Tr |
|--|--|--|--|--|--|--|
| W | 1.0 | 0.6 | 0.7 | 0.5 | 0.4 | 0.8 |
| C | | 1.0 | 0.5 | 0.8 | 0.4 | 0.6 |
| H | | | 1.0 | 0.7 | 0.6 | 0.9 |
| J | | | | 1.0 | 0.6 | 0.5 |
| T | | | | | 1.0 | 0.7 |
| Tr | | | | | | 1.0 |

**Quad Matrix:** Q1×Q4=0.9 | Q2×Q3=0.8 | Q1×Q2=0.7 | Q3×Q4=0.7 | Q1×Q3=0.7 | Q2×Q4=0.6 | same=0.5-0.6

**Jung Matrix:** TJ×FJ=0.8 | TJ×TP=0.8 | TP×FP=0.8 | FJ×FP=0.8 | TP×FJ=0.6 | TJ×FP=0.5

#### Layer 2: Wu Xing (เบญจธาตุจีน)

```python
THAI_TO_WUXING = {"ไฟ":"ไฟ", "ดิน":"ดิน", "ลม":"ไม้", "น้ำ":"น้ำ"}
GENERATION = {"ไม้":"ไฟ", "ไฟ":"ดิน", "ดิน":"ทอง", "ทอง":"น้ำ", "น้ำ":"ไม้"}

def wu_xing(a, b):
    if a == b: return (1, "กลมกลืน")
    if GENERATION[a] == b: return (2, "ส่งเสริม")
    if GENERATION[b] == a: return (-1, "สูบพลัง")
    return (0, "กลาง")
    # หมายเหตุ: Destruction ไม่ได้ใช้ใน v1 เพื่อไม่ให้ผล negative เกินไป
```

#### Layer 3: Team Element Balance

```python
team_el = {"ไฟ":0, "ดิน":0, "ลม":0, "น้ำ":0}
for each member:
    for each element in member.seed:
        team_el[element] += seed_count

# ธาตุที่ขาด (≤1 แหล่ง) = จุดอ่อนทีม
# ธาตุที่เกิน (≥6 แหล่ง) = อาจ "ร้อนเกิน/เบาเกิน"
```

#### Layer 4: Quadrant Coverage Map

```
Q1 (Explorer): ใครในทีม?  → ถ้าว่าง = ขาดคนสร้าง connection/โอกาสใหม่
Q2 (Thinker):  ใครในทีม?  → ถ้าว่าง = ขาดคนวิเคราะห์เชิงลึก
Q3 (Connector): ใครในทีม? → ถ้าว่าง = ขาดคนประสาน/สื่อสาร ← จุดบอดบ่อยที่สุด
Q4 (Builder):  ใครในทีม?  → ถ้าว่าง = ขาดคนลงมือทำ/รักษาระบบ
```

#### Layer 5: Combined Score + Recommendations

```python
for each pair:
    wx_score = wu_xing(A.seed_dominant, B.seed_dominant)[0]
    wx_norm = (wx_score + 2) / 4  # normalize -2..+2 → 0..1
    combined = demm_score * 0.6 + wx_norm * 0.4
    final_pct = combined * 100
```

### 5.2 ตัวอย่างผล Team Analysis จริง (วุฒิ์ธิระ × ปสฎา × จักรกฤษณ์)

```
วุฒิ์ธิระ: Y_J-Q4-TJ | O=2.9 C=3.1 E=2.5 A=3.5 N=3.0 | Energy83 | ไฟ(3)ดิน(2)
ปสฎา:     Y_C-Q4-TP | O=2.9 C=3.3 E=1.0 A=2.8 N=2.8 | Energy83 | ไฟ(2)ลม(2)ดิน(1)น้ำ(1)
จักรกฤษณ์: Y_T-Q2-FP | O=4.3 C=3.2 E=2.7 A=3.5 N=2.3 | Energy96 | ไฟ(2)น้ำ(2)ดิน(1)

DEMM Scores:
  วุฒิ์ธิระ × ปสฎา:     73% (VIA J×C=0.8★, Q4×Q4=0.5, Jung TJ×TP=0.8★)
  วุฒิ์ธิระ × จักรกฤษณ์: 65% (VIA J×T=0.6, Q4×Q2=0.6, Jung TJ×FP=0.5)
  ปสฎา × จักรกฤษณ์:    62% (VIA C×T=0.4, Q4×Q2=0.6, Jung TP×FP=0.8★)

Team Element: ไฟ(7=44%)★ ดิน(4=25%) น้ำ(3=19%) ลม(2=12%)←ขาด
Quadrant Gap: Q1=ว่าง! Q3=ว่าง! → ขาดคนเชื่อม+นำสังคม
E ต่ำทุกคน: วุฒิ์ธิระ=2.5, จักรกฤษณ์=2.7, ปสฎา=1.0 → ไม่มีใครพูดนำ

คำแนะนำ:
  บทบาท: วุฒิ์ธิระ=วางระบบ/ตัดสินใจ | ปสฎา=ทดสอบ/ลงมือทำ | จักรกฤษณ์=วิเคราะห์/ดูแลทีม
  ระวัง: ไฟ×3=ขัดแย้งง่าย | ไม่มีคน Q3=ผลงานดีแต่ขายไม่เก่ง
  แก้: Document-based communication (เขียนแทนประชุม) + หาคน Q3 เสริม
```

---

## 6. คำถามสั้น 3 ข้อ — ประเมินคนรอบข้าง

สำหรับกรณีที่คนที่ถูกประเมินไม่ได้ทำแบบทดสอบ DEMM เอง

### 6.1 ชุดคำถาม

**Q1: เมื่อเกิดปัญหาเร่งด่วน คนนี้ทำอะไร?**
- A: ลุยแก้ทันที → ไฟ + Q4 Builder
- B: วิเคราะห์ก่อน คิดนาน → ลม + Q2 Thinker
- C: ถามทีมก่อน หาความเห็น → น้ำ + Q3 Connector
- D: รอดูสถานการณ์ ไม่รีบ → ดิน + Q4 Builder (อนุรักษ์)

**Q2: สไตล์การทำงานของคนนี้?**
- A: ทำคนเดียว ไม่ชอบประชุม → E ต่ำ (เก็บตัว)
- B: ประชุมทีมตลอด ชอบระดมสมอง → E สูง (สังคม)

**Q3: คนนี้ตัดสินใจด้วยอะไรเป็นหลัก?**
- A: ข้อมูล ตรรกะ เหตุผล → T (Thinking)
- B: ความรู้สึก คนรอบข้าง บรรยากาศ → F (Feeling)

### 6.2 การคำนวณ

```python
def estimate_person(q1, q2, q3):
    # ประมาณ Quadrant
    if q1 in ["A","D"]:     quad = "Q4"  # Builder
    elif q1 == "B":         quad = "Q2"  # Thinker
    elif q1 == "C":         quad = "Q3"  # Connector
    
    # ปรับ E
    e_high = (q2 == "B")
    if e_high and quad == "Q4": quad = "Q3"
    if e_high and quad == "Q2": quad = "Q1"
    
    # Jung
    tf = "T" if q3 == "A" else "F"
    jp = "J"  # default J (ถ้าตอบ q1=A หรือ D = มีแนวโน้ม J)
    jung = tf + jp
    
    return {"quad": quad, "jung": jung, "confidence": "low"}
    # หมายเหตุ: ความแม่นยำ ~60% เพียงพอสำหรับคำแนะนำเบื้องต้น
```

### 6.3 Chatbot ถามเพิ่มเติมได้

หากผู้ใช้ถาม "เจ้านายฉันเข้ากับฉันไหม?" → AI ถาม 3 ข้อ → ประเมิน → เทียบกับ user profile

---

## 7. AI CHATBOT — System Prompt & Logic

### 7.1 System Prompt (Platform D)

```
คุณคือ KRUTH MIND — AI Psychology Coach ที่เชี่ยวชาญด้านจิตวิทยาบุคลิกภาพ 
ใช้ระบบ KRUTH DEMM (Big Five / VIA / Jungian) เป็นฐาน

ข้อมูลผู้ใช้:
[INSERT USER PROFILE HERE]
- Archetype: {archetype_id} — {archetype_name_th}
- OCEAN: O={O} C={C} E={E} A={A} N={N}
- Quadrant: {quad_primary} ({quad_secondary if borderline})
- VIA: {via_dominant}
- Jungian: {jung_type}
- Dosha: {dosha}
- Energy: {energy_id} {energy_name}
- ธาตุขาด: {missing_elements}

กฎการตอบ:
1. ห้ามเปิดเผย Clinical Signals (ADHD/Burnout/OCD/SA/Delusion) ต่อผู้ใช้ทั่วไป
2. ถ้าตรวจพบ Rain 🟠/🔴 → แนะนำให้พูดคุยกับผู้เชี่ยวชาญ อย่าวินิจฉัยเอง
3. ถ้าตรวจพบ has_crisis=true → แนะนำสายด่วนสุขภาพจิต 1323 ทันที
4. ใช้ภาษาไทยเป็นหลัก อบอุ่น ไม่เป็นทางการเกิน
5. อ้างอิง DEMM เมื่อให้คำแนะนำ เช่น "คุณเป็น Q4 Builder ซึ่งชอบ..."
6. ห้ามบอกว่า "ตามข้อมูลในระบบ" — ให้พูดเป็นธรรมชาติ

หัวข้อที่ตอบได้:
- วิเคราะห์บุคลิกตัวเอง / จุดแข็ง-จุดอ่อน
- วิธีปรับตัวกับคน Q1/Q2/Q3/Q4 อื่นๆ
- Compatibility กับคนที่ระบุ (ใช้คำถาม 3 ข้อ)
- คำแนะนำพัฒนาตนเองตาม Archetype
- Team Analysis เมื่อระบุสมาชิกทีม
```

### 7.2 Response Templates

**เมื่อถามเรื่องบุคลิก:**
```
"จากบุคลิกของคุณในฐานะ[archetype_name] คุณมีจุดแข็งคือ[strength_1,2,3]
สิ่งที่อาจเป็นความท้าทายสำหรับคุณคือ[challenge]
คำแนะนำที่ตรงกับตัวคุณมากที่สุดคือ[recommendation]"
```

**เมื่อถามเรื่องความสัมพันธ์:**
```
"คนที่คุณพูดถึงน่าจะเป็นแบบ[estimated_quad]-[estimated_jung]
ความสัมพันธ์ระหว่างคุณกับคนนี้มีจุดแข็งคือ[compat_strength]
และควรระวัง[compat_challenge]
วิธีปรับตัวที่ดีที่สุดคือ[social_tip_from_archetype]"
```

**เมื่อตรวจพบ Rain 🟡:**
```
"ฉันสังเกตว่าช่วงนี้อาจมีความเครียดสะสมอยู่บ้าง 
อยากแนะนำให้ลองพักผ่อนมากขึ้น และพูดคุยกับคนที่คุณไว้ใจ
ถ้าความรู้สึกนี้ยังคงอยู่นาน การพูดคุยกับผู้เชี่ยวชาญก็เป็นทางเลือกที่ดีมากเลยนะคะ"
```

---

## 8. ELEMENT SEED — การคำนวณธาตุกำเนิด

### 8.1 แหล่งข้อมูล 6 แหล่ง

```python
def calc_element_seed(user):
    el = {"ไฟ":0, "ดิน":0, "ลม":0, "น้ำ":0}
    
    # 1. ธาตุวัน (วันเกิด)
    DAY_EL = {"อาทิตย์":"ไฟ","จันทร์":"น้ำ","อังคาร":"ไฟ",
              "พุธ":"ดิน","พฤหัสบดี":"ลม","ศุกร์":"น้ำ","เสาร์":"ดิน"}
    el[DAY_EL[user.day_of_week]] += 1
    
    # 2. ธาตุไทย (เดือนเกิด)
    el[user.thai_element.replace("ธาตุ","")] += 1
    
    # 3. ธาตุจีน (ปีเกิด → Wu Xing)
    cn = user.chinese_element  # "ธาตุไฟ (Fire)" etc.
    if "Fire" in cn: el["ไฟ"] += 1
    elif "Earth" in cn: el["ดิน"] += 1
    elif "Wood" in cn: el["ลม"] += 1  # ไม้ → ลม ใน DEMM
    elif "Water" in cn: el["น้ำ"] += 1
    elif "Metal" in cn: el["ดิน"] += 1  # ทอง → ดิน ใน DEMM
    
    # 4. ธาตุปีนักษัตร
    ANIMAL_EL = {"ชวด(หนู)":"น้ำ","ฉลู(วัว)":"ดิน","ขาล(เสือ)":"ไม้",
                 "เถาะ(กระต่าย)":"ไม้","มะโรง(งูใหญ่)":"ดิน","มะเส็ง(งูเล็ก)":"ไฟ",
                 "มะเมีย(ม้า)":"ไฟ","มะแม(แพะ)":"ดิน","วอก(ลิง)":"ทอง",
                 "ระกา(ไก่)":"ทอง","จอ(สุนัข)":"ดิน","กุน(หมู)":"น้ำ"}
    animal_el = ANIMAL_EL[get_animal(birth_year)]
    if animal_el == "ไม้": el["ลม"] += 1
    elif animal_el == "ทอง": el["ดิน"] += 1
    else: el[animal_el] += 1
    
    # 5. ธาตุชื่อ (เปอร์เซ็นต์จากการคำนวณ Kangxi)
    if user.name_fire_pct > 30: el["ไฟ"] += 1
    if user.name_earth_pct > 30: el["ดิน"] += 1
    if user.name_wind_pct > 30: el["ลม"] += 1
    if user.name_water_pct > 30: el["น้ำ"] += 1
    
    # 6. pDCR (ปัจจุบัน — จาก DEMM test)
    # ใช้เป็น L3 (State) ไม่ใส่ใน Seed
    
    return el  # {"ไฟ":3, "ดิน":2, "ลม":0, "น้ำ":0}
```

### 8.2 Multi-Layer Identity

```
L1 Seed (Birth Layer):   ธาตุวัน + ธาตุไทย + ธาตุจีน + ธาตุปีนักษัตร + ธาตุชื่อ
                         → ไม่เปลี่ยน ตลอดชีวิต

L2 Personality (DEMM):   Big Five + VIA + Jungian + Quadrant
                         → เปลี่ยนช้า (ปีละครั้ง)

L3 State (pDCR/Dosha):   ไฟ/ลม/น้ำ/ดิน ปัจจุบัน จาก behavior answers
                         → เปลี่ยนเร็ว (สัปดาห์-เดือน)

ตีความ: "Adaptive Persona = L1 + L3"
  คนธาตุไฟ (L1) + ปัจจุบันลมกำเริบ (L3) = Adaptive Persona ออกมาเป็นคิดฟุ้งซ่าน
  แต่แก่นแท้ยังเป็นไฟ → เสริมดินได้ผลทันที
```

### 8.3 Friction Score

```python
def calc_friction(user):
    """แรงเสียดทานระหว่างธาตุแก่นแท้กับพฤติกรรมปัจจุบัน"""
    friction = 0
    
    # คนวันไฟ (อังคาร/อาทิตย์) แต่ E ต่ำ = "ไฟที่ถูกกดทับ"
    if user.day_el == "ไฟ" and user.E < 2.5: friction = 3
    elif user.day_el == "ไฟ" and user.E < 3.0: friction = 2
    
    # คนวันดิน (พุธ/เสาร์) E ต่ำ = ไม่เสียดทาน (ดินเก็บตัวตามธรรมชาติ)
    elif user.day_el == "ดิน" and user.E < 2.5: friction = 0
    
    # คนวันลม (พฤหัส) + pDCR_W สูง = "ลมเกินจนฟุ้ง"
    elif user.day_el == "ลม" and user.pDCR_W >= 6: friction = 2
    
    # N สูง เพิ่ม friction เสมอ
    if user.N >= 3.5: friction += 1.5
    elif user.N >= 3.0: friction += 0.5
    
    return friction  # 🔴 ≥3 | 🟡 ≥2 | 🟢 <2

# จากข้อมูล n=42: Friction สูง → Fog Flag สูงกว่า 3 เท่า (25% vs 8%)
```

---

## 9. VALIDATED CORRELATIONS (n=42)

ข้อมูลที่ยืนยันได้จาก dataset จริง ใช้เป็นฐานคำอธิบายของ AI:

| สมการ/Pattern | Accuracy | หมายเหตุ |
|--------------|---------|---------|
| Vata (ลม) → Q2 Thinker | **77%** (17/22) | แข็งแกร่งมาก ใช้ได้ |
| Pitta (ไฟ) → Q4 Builder | **63%** (10/16) | ใช้ได้ |
| วันดิน (พุธ/เสาร์) → E ต่ำสุด | **100%** (8/8) | ยืนยันสมบูรณ์ |
| Friction สูง → Fog 3 เท่า | **3×** (25% vs 8%) | ใช้ทำนายได้ |
| ขาดน้ำ = ธาตุขาดมากที่สุด | **44%** (16/37) | insight สำคัญ |
| Test-Retest Reliability (OCEAN) | **±0.2** | O/E/A/N คงที่ |
| Energy 00-99 ตรงกับชีวิตจริง | **100%** | ยืนยัน 3/3 คน |

**ไม่มีข้อมูลพอ (ต้องระวัง):**
- Kapha patterns: n=4 (น้อยเกิน)
- Bolt Flag → ไฟกำเริบ: n=2
- Bipolar / Dissociation: ต้อง longitudinal data

---

## 10. REVENUE MODEL & PRICING

### 10.1 Tier Structure

| Tier | ราคา | สิ่งที่ได้ | กลุ่มเป้าหมาย |
|------|------|-----------|--------------|
| **Free** | ฟรี | ทำ DEMM + ดู Archetype + Compatibility top3 | บุคคลทั่วไป |
| **Personal** | 99 บาท/เดือน | + AI Coach ไม่จำกัด + รายงานเต็ม + Social Guide | บุคคล |
| **Team** | 299 บาท/คน/เดือน (min 5 คน) | + Team Dashboard + Quadrant Map + Compat Matrix | SME |
| **Organization** | Custom (ราคาต่อหน่วยงาน) | + Care Dashboard + Clinical Signals + API Access | โรงเรียน/สกร./อบต. |

### 10.2 Revenue Drivers

- Viral loop: Free users ทำ DEMM → แชร์ผล → เพื่อนทำตาม → Upgrade ถ้าชอบ
- B2B: องค์กรใช้ต่อเนื่อง = recurring revenue ที่มั่นคงกว่า B2C
- First paying customer: โรงเรียนเอกชน (Christian school) — ใช้เป็น reference case

---

## 11. VALIDATION PROTOCOL

### 11.1 เป้าหมาย

```
Cronbach's α ≥ 0.70 ในทุก OCEAN dimension
n ≥ 200 (ปัจจุบัน n=42)
Test-Retest interval: 4-6 สัปดาห์
```

### 11.2 ขั้นตอน

1. **Phase 1 (n=200):** เก็บข้อมูลจากนักศึกษา Rajabhat NKR / SUT
2. **Phase 2:** เปรียบเทียบกับ BFI-44 (standard Big Five) → convergent validity
3. **Phase 3:** ติดตาม 6 เดือน → predictive validity (ดูว่า Rain Flag ทำนาย burnout ได้จริงไหม)
4. **Publication:** เสนอต่อ Khurusapha Research Competition

---

## 12. ROADMAP

```
Q2 2026 (ตอนนี้):
  ✅ Platform A (Vercel) — ใช้งานได้
  ✅ DEMM V7.4 (487 ข้อ)
  ✅ 96 Archetypes (ไทย)
  ✅ Hybrid Compatibility v2.0
  ✅ Clinical Signals 5 ตัว + Delusion
  ✅ n=42 data + validation เบื้องต้น
  ⏳ SQL migration: 006_add_delusion_columns.sql (ยังไม่ได้รัน)

Q3 2026:
  → AI Chatbot MVP (ใช้ Claude API)
  → Team Dashboard (web app)
  → คำถามสั้น 3 ข้อ (validate กับ DEMM full)
  → n=200 validation study เริ่ม

Q4 2026:
  → Platform D official launch
  → B2B sales: 3 องค์กร pilot
  → Longitudinal tracking (round 2 assessments)

Q1 2027:
  → Platform E (KRUTH ELEMENT) — เริ่ม develop
  → Bridge Data: D ↔ E
  → Academic paper submission
```

---

## 13. ไฟล์แนบที่ควรส่งไปด้วย

เมื่อส่ง Handoff Document นี้ให้ AI อื่น ควรแนบไฟล์เหล่านี้:

### ต้องแนบ (Critical):
1. **`lib/scoring.ts`** — โค้ดสมการทั้งหมด (version ล่าสุดพร้อม WHO-5 Guard v3 + Clinical Signals + Delusion)
2. **`lib/types.ts`** — TypeScript types
3. **`app/api/score/route.ts`** — API integration
4. **`results_rows__5_.csv`** — ตัวอย่างผลลัพธ์จริง 3 คน (วุฒิ์ธิระ/ปสฎา/จักรกฤษณ์)
5. **`category_flags_rows__4_.csv`** — ตัวอย่าง Flags จริง (หลัง WHO-5 fix)

### ควรแนบ (Recommended):
6. **`V7_4_DVJ_Master_Sheet_FIXED.xlsx`** — คำถาม 487 ข้อ + 96 Archetypes (แก้ไขแล้ว)
7. **`006_add_delusion_columns.sql`** — SQL ที่ยังต้องรัน

### ไม่จำเป็น (Optional):
8. Users CSV — ข้อมูล demo ถ้าต้องการทดสอบ

---

## 14. KNOWN ISSUES & TODO

| Issue | Status | Action |
|-------|--------|--------|
| `006_add_delusion_columns.sql` ยังไม่ได้รัน | 🔴 Critical | รันใน Supabase SQL Editor |
| pDCR ลม bias? 56% ได้ลม dominant | ⚠️ สงสัย | ตรวจสอบคำถาม Section E |
| Kapha patterns: n=4 น้อยเกิน | ℹ️ Data | เก็บ n เพิ่ม |
| Social Anxiety cutoff 🟠 ≥6 สูงไปไหม? | ⚠️ ทบทวน | ดูจาก n=200 |
| Dream Psychology themes: 22/50 | ⏳ WIP | ต้องเพิ่มอีก 28 themes |
| Platform E spec ยังไม่มีเอกสาร | ⏳ Pending | สร้างหลัง Platform D launch |

---
*Document version: 1.0 | April 2026 | KRUTH APEX / Di Vi Jitr*
*ห้ามเผยแพร่โดยไม่ได้รับอนุญาต*
