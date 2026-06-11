import type { Answer, Scores, QuadrantResult, Flags, FlagResult, ArchetypeResult, Confidence } from './types';

// ═══ Parse Score Tags ═══
function parseTags(s: string): { d: string; v: number }[] {
  if (!s) return [];
  return s.split('|').map(p => {
    const m = p.match(/([A-Za-z_\-]+):([\+\-]?\d+\.?\d*)/);
    return m ? { d: m[1], v: parseFloat(m[2]) } : null;
  }).filter(Boolean) as any[];
}

// ═══ Big Five + pDCR Scores ═══
export function calcScores(answers: Answer[]): Scores {
  const tot: Record<string, number> = { O:0,C:0,E:0,A:0,N:0,WHO5:0,GDS:0,ADL:0,pDCR_F:0,pDCR_W:0,pDCR_A:0,pDCR_E:0 };
  const cnt: Record<string, number> = { O:0,C:0,E:0,A:0,N:0 };
  for (const a of answers) {
    for (const { d, v } of parseTags(a.score_raw)) {
      if (d in tot) { tot[d] += v; if (d in cnt) cnt[d]++; }
    }
  }
  return {
    O: cnt.O > 0 ? Math.round(tot.O / cnt.O * 10) / 10 : 0,
    C: cnt.C > 0 ? Math.round(tot.C / cnt.C * 10) / 10 : 0,
    E: cnt.E > 0 ? Math.round(tot.E / cnt.E * 10) / 10 : 0,
    A: cnt.A > 0 ? Math.round(tot.A / cnt.A * 10) / 10 : 0,
    N: cnt.N > 0 ? Math.round(tot.N / cnt.N * 10) / 10 : 0,
    WHO5: tot.WHO5, GDS: tot.GDS, ADL: tot.ADL,
    pDCR_F: tot.pDCR_F, pDCR_W: tot.pDCR_W, pDCR_A: tot.pDCR_A, pDCR_E: tot.pDCR_E,
  };
}

// ═══ Dominant Element ═══
export function getDominant(sc: Scores): string {
  const d: Record<string, number> = { F: sc.pDCR_F, W: sc.pDCR_W, A: sc.pDCR_A, E: sc.pDCR_E };
  return Object.entries(d).reduce((a, b) => a[1] >= b[1] ? a : b)[0];
}

// ═══ Jungian (V7.3 Cross-Validation) ═══
export function calcJungian(answers: Answer[], sc?: Scores): { type: string; T: number; F: number; J: number; P: number } {
  let T = 0, F = 0, J = 0, P = 0;
  for (const a of answers) {
    for (const part of (a.score_raw || '').split('|')) {
      const m = part.match(/^([TFJP]):([\+\-]?\d+\.?\d*)/);
      if (!m) continue;
      const v = parseFloat(m[2]);
      if (m[1] === 'T') T += v; if (m[1] === 'F') F += v;
      if (m[1] === 'J') J += v; if (m[1] === 'P') P += v;
    }
  }
  let t_res = T >= F ? 'T' : 'F';
  if (T === F && sc) t_res = sc.A >= 3.0 ? 'F' : 'T';
  let j_res = J >= P ? 'J' : 'P';
  if (J === P && sc) j_res = sc.C >= 3.0 ? 'J' : 'P';
  return { type: t_res + j_res, T, F, J, P };
}

// ═══ VIA Scores ═══
export function calcViaScores(answers: Answer[]): Record<string, number> {
  const via: Record<string, number> = { W: 0, C: 0, H: 0, J: 0, T: 0, Tr: 0 };
  for (const a of answers) {
    for (const part of (a.score_raw || '').split('|')) {
      const m = part.match(/VIA-([A-Za-z]+):([\+\-]?\d+\.?\d*)/);
      if (!m) continue;
      const k = m[1], v = parseFloat(m[2]);
      if (k === 'W' || k === 'Wisdom') via.W += v;
      if (k === 'C' || k === 'Courage') via.C += v;
      if (k === 'H' || k === 'Humanity') via.H += v;
      if (k === 'J' || k === 'Justice') via.J += v;
      if (k === 'T' || k === 'Temperance') via.T += v;
      if (k === 'Tr' || k === 'Transcendence') via.Tr += v;
    }
  }
  return via;
}

// ═══ Fuzzy Quadrant ═══
export function calcFuzzyQuadrant(O: number, E: number): QuadrantResult {
  const cutoff = 3.0, zone = 0.3;
  const conf_O = Math.min(Math.abs(O - cutoff) / zone, 1.0);
  const conf_E = Math.min(Math.abs(E - cutoff) / zone, 1.0);
  const highO = O >= cutoff, highE = E >= cutoff;
  const primary = highO && highE ? 'Q1' : highO ? 'Q2' : highE ? 'Q3' : 'Q4';
  let secondary = '';
  const isBorderline = conf_O < 1.0 || conf_E < 1.0;
  if (isBorderline) {
    const altO = conf_O < 1.0 ? !highO : highO;
    const altE = conf_E < 1.0 ? !highE : highE;
    if (conf_O < conf_E) secondary = altO && highE ? 'Q1' : altO ? 'Q2' : highE ? 'Q3' : 'Q4';
    else secondary = highO && altE ? 'Q1' : highO ? 'Q2' : altE ? 'Q3' : 'Q4';
    if (secondary === primary) secondary = '';
  }
  return { primary, secondary, conf_O: Math.round(conf_O * 100) / 100, conf_E: Math.round(conf_E * 100) / 100, isBorderline };
}

// ═══ Helper: Extract SCR signals ═══
function extractSCR(answers: Answer[]): Record<string, number> {
  const scr: Record<string, number> = {};
  for (const a of answers) {
    for (const part of (a.score_raw || '').split('|')) {
      const m = part.match(/^SCR-([A-Z]+):(\d+\.?\d*)/);
      if (m) scr[m[1]] = (scr[m[1]] || 0) + parseFloat(m[2]);
    }
  }
  return scr;
}

// ═══════════════════════════════════════════════════════════════════════
// Multi-Dim Flags — WHO-5 Guard v3
// ═══════════════════════════════════════════════════════════════════════
export function calcMultiDimFlags(sc: Scores, band: string, answers: Answer[]): Flags {
  const who5Answers = answers.filter(a => {
    if (!a.score_raw) return false;
    return a.score_raw.split('|').some(p => p.startsWith('WHO5:'));
  });
  const hasWHO5 = who5Answers.length >= 3 && sc.WHO5 > 0;
  const who5 = sc.WHO5 || 0;

  const via = calcViaScores(answers);
  const hasVia = Object.values(via).some(v => v > 0);
  const viaMin = hasVia ? Object.entries(via).reduce((a, b) => a[1] <= b[1] ? a : b)[0] : '';
  const hasCrisis = answers.some(a => a.alert === 'CRISIS' && (a.choice === 'C' || a.choice === 'D'));

  // 🌧 Rain
  let rainScore = 0;
  if (hasWHO5) { if (who5 <= 8) rainScore += 4; else if (who5 <= 12) rainScore += 2; }
  if (sc.N >= 4.0) rainScore += 3; else if (sc.N >= 3.5) rainScore += 2;
  if (sc.C <= 2.0) rainScore += 1;
  if (hasVia && viaMin === 'Tr') rainScore += 1;
  const rain: FlagResult = { score: rainScore, level: hasCrisis ? '🔴' : rainScore >= 7 ? '🔴' : rainScore >= 5 ? '🟠' : rainScore >= 3 ? '🟡' : '' };

  // ⚡ Bolt
  let boltScore = 0;
  if (sc.N >= 4.0) boltScore += 2; if (sc.A <= 1.5) boltScore += 2;
  if (sc.C <= 1.5) boltScore += 2; if (sc.E >= 4.5) boltScore += 1;
  const bolt: FlagResult = { score: boltScore, level: boltScore >= 5 ? '🔴' : boltScore >= 3 ? '🟠' : boltScore >= 2 ? '🟡' : '' };

  // 🌫 Fog
  let fogScore = 0;
  if (sc.E <= 1.5 && hasWHO5 && who5 <= 12) fogScore += 3;
  if (sc.A <= 2.0) fogScore += 1;
  if (hasWHO5 && who5 <= 12) fogScore += 1;
  if (hasVia && viaMin === 'H') fogScore += 1;
  const fog: FlagResult = { score: fogScore, level: fogScore >= 5 ? '🔴' : fogScore >= 3 ? '🟠' : fogScore >= 2 ? '🟡' : '' };

  // 🔋 Battery (Band F/G)
  let battery: FlagResult = { score: 0, level: '' };
  if (band === 'F' || band === 'G') {
    let batScore = 0;
    if ((sc.ADL || 99) <= 4) batScore += 3;
    if (sc.GDS >= 6) batScore += 2; if (sc.GDS >= 11) batScore += 2;
    if (sc.C <= 2.0 && sc.N >= 3.5) batScore += 1;
    if (hasWHO5 && who5 <= 8) batScore += 1;
    battery = { score: batScore, level: sc.GDS >= 11 ? '🔴' : batScore >= 5 ? '🔴' : batScore >= 3 ? '🟠' : batScore >= 2 ? '🟡' : '' };
  }

  return { rain, bolt, fog, battery };
}

// ═══════════════════════════════════════════════════════════════════════
// Clinical Signals — ADHD / Burnout / OCD / Social Anxiety / Delusion
// ซ่อนจากผู้ใช้ทั่วไป → เก็บใน category_flags สำหรับ Care Dashboard
// ═══════════════════════════════════════════════════════════════════════

export interface ClinicalSignal {
  score: number;
  level: string;
  details: string[];
}

export interface DelusionSignal extends ClinicalSignal {
  action: string;
}

export interface ClinicalSignals {
  adhd: ClinicalSignal;
  burnout: ClinicalSignal;
  ocd: ClinicalSignal;
  socialAnxiety: ClinicalSignal;
  delusion: DelusionSignal;
}

export function calcClinicalSignals(sc: Scores, answers: Answer[], flags: Flags, confidence: Confidence): ClinicalSignals {
  const scr = extractSCR(answers);
  const who5Count = answers.filter(a => a.score_raw?.split('|').some(p => p.startsWith('WHO5:'))).length;
  const hasWHO5 = who5Count >= 3 && sc.WHO5 > 0;

  // ═══ 🎯 ADHD ═══
  let adhdScore = 0;
  const adhdD: string[] = [];
  if ((scr['ADHD'] || 0) >= 3)      { adhdScore += 3; adhdD.push('พฤติกรรมสมาธิสั้นจากแบบประเมิน (≥3 ข้อ)'); }
  else if ((scr['ADHD'] || 0) >= 2)  { adhdScore += 2; adhdD.push('พฤติกรรมสมาธิสั้นจากแบบประเมิน (2 ข้อ)'); }
  if (sc.C <= 2.0)      { adhdScore += 2; adhdD.push('วินัย/สมาธิต่ำมาก (C ≤ 2.0)'); }
  else if (sc.C <= 2.5) { adhdScore += 1; adhdD.push('วินัย/สมาธิค่อนข้างต่ำ (C ≤ 2.5)'); }
  if (sc.N >= 3.5)                      { adhdScore += 1; adhdD.push('หุนหันพลันแลน (N ≥ 3.5)'); }
  if (sc.O >= 3.5 && sc.C <= 2.5)       { adhdScore += 1; adhdD.push('ไอเดียเยอะแต่จบยาก (O สูง + C ต่ำ)'); }
  const adhd: ClinicalSignal = { score: adhdScore, level: adhdScore >= 5 ? '🟠' : adhdScore >= 3 ? '🟡' : '', details: adhdD };

  // ═══ 🔥 Burnout ═══
  let burnoutScore = 0;
  const burnoutD: string[] = [];
  if (sc.C >= 4.0 && sc.N >= 3.0)       { burnoutScore += 3; burnoutD.push('ขยันมากจนเครียด (C ≥ 4.0 + N ≥ 3.0)'); }
  else if (sc.C >= 3.5 && sc.N >= 3.5)  { burnoutScore += 2; burnoutD.push('ขยัน+อ่อนไหว (C ≥ 3.5 + N ≥ 3.5)'); }
  if (hasWHO5 && sc.WHO5 <= 12 && sc.C >= 3.5) { burnoutScore += 2; burnoutD.push('สุขภาวะต่ำทั้งที่ขยัน (ขยันแต่ไม่มีความสุข)'); }
  if (flags.rain.level && sc.C >= 3.5)          { burnoutScore += 1; burnoutD.push('มีสัญญาณอารมณ์ทดถอย + ขยัน (เหนื่อยสะสม)'); }
  if (sc.E <= 2.0 && sc.C >= 4.0)               { burnoutScore += 1; burnoutD.push('แบกงานคนเดียว (E ต่ำ + C สูง)'); }
  const burnout: ClinicalSignal = { score: burnoutScore, level: burnoutScore >= 5 ? '🟠' : burnoutScore >= 3 ? '🟡' : '', details: burnoutD };

  // ═══ 🔄 OCD ═══
  let ocdScore = 0;
  const ocdD: string[] = [];
  if ((scr['OCD'] || 0) >= 2)              { ocdScore += 3; ocdD.push('พฤติกรรมย้ำคิดย้ำทำจากแบบประเมิน'); }
  if (sc.C >= 4.5 && sc.N >= 3.5)          { ocdScore += 2; ocdD.push('ต้องสมบูรณ์แบบ + กังวลถ้าไม่ได้ทำ (C สูงมาก + N สูง)'); }
  else if (sc.C >= 4.0 && sc.N >= 3.0)     { ocdScore += 1; ocdD.push('มีแนวโน้มเป๊ะ+กังวล (C สูง + N ปานกลาง)'); }
  if (sc.O <= 2.0 && sc.C >= 4.0)          { ocdScore += 1; ocdD.push('ยึดติดรูปแบบเดิม (O ต่ำ + C สูง)'); }
  const checkQ = answers.some(a => a.q_id?.includes('N03') && a.choice === 'A');
  if (checkQ) { ocdScore += 1; ocdD.push('มีพฤติกรรมเช็คซ้ำ (กลับไปดูว่าล็อคประตูหรือยัง)'); }
  const ocd: ClinicalSignal = { score: ocdScore, level: ocdScore >= 5 ? '🟠' : ocdScore >= 3 ? '🟡' : '', details: ocdD };

  // ═══ 😰 Social Anxiety ═══
  let saScore = 0;
  const saD: string[] = [];
  if (sc.E <= 1.5)      { saScore += 3; saD.push('หลีกเลี่ยงสังคมมาก (E ≤ 1.5)'); }
  else if (sc.E <= 2.0) { saScore += 2; saD.push('เก็บตัวค่อนข้างมาก (E ≤ 2.0)'); }
  if (sc.N >= 3.5 && sc.E <= 2.5) { saScore += 2; saD.push('กังวล + หลีกเลี่ยงสังคม (N สูง + E ต่ำ)'); }
  if (sc.A <= 2.0 && sc.E <= 2.0)  { saScore += 1; saD.push('ไม่ไว้ใจคน + หลีกเลี่ยงสังคม (A ต่ำ + E ต่ำ)'); }
  if ((scr['WD'] || 0) >= 1)       { saScore += 1; saD.push('พฤติกรรมถอยตัวจากสังคม'); }
  if (flags.fog.level)              { saScore += 1; saD.push('มีสัญญาณถอยตัว (Fog Flag)'); }
  if (hasWHO5 && sc.WHO5 <= 12 && sc.E <= 2.0) { saScore += 1; saD.push('สุขภาวะต่ำ + ไม่เข้าสังคม'); }
  const socialAnxiety: ClinicalSignal = { score: saScore, level: saScore >= 6 ? '🟠' : saScore >= 3 ? '🟡' : '', details: saD };

  // ═══════════════════════════════════════════════════════════════════
  // 🔮 Delusion Signal — ตรวจจับสภาวะหลงผิด / ขาดการเชื่อมต่อกับความเป็นจริง
  // ═══════════════════════════════════════════════════════════════════
  let delusionScore = 0;
  const delusionD: string[] = [];

  // ── 1. คิดว่าตัวเองยิ่งใหญ่เกินจริง (Grandiosity) ──
  // คนปกติไม่มีทาง O สูงสุดและ N ต่ำสุดพร้อมกัน
  // ถ้า SD สูงด้วย = มีโอกาสสูงที่มองตัวเองดีเกินจริง
  if (sc.O >= 4.8 && sc.N <= 1.5) {
    delusionScore += 3;
    delusionD.push('มองตัวเองดีเกินจริง — เปิดกว้างสูงสุดแต่ไม่มีความกังวลเลย (O ≥ 4.8 + N ≤ 1.5)');
  } else if (sc.O >= 4.5 && sc.N <= 1.5) {
    delusionScore += 2;
    delusionD.push('แนวโน้มมองตัวเองดีเกิน (O สูงมาก + N ต่ำมาก)');
  }

  // SD สูง + N ต่ำ = ตอบดีเกินจริง + ไม่ยอมรับข้อเสีย
  if (confidence.details.sd >= 2 && sc.N <= 2.0) {
    delusionScore += 2;
    delusionD.push('ตอบดีเกินจริงและไม่ยอมรับจุดอ่อนตัวเอง (SD สูง + N ต่ำ)');
  }

  // ── 2. คะแนนสุดขั้วผิดปกติ (Extreme Profile) ──
  // คนปกติไม่สุดขั้วพร้อมกันทุกมิติ
  const extremeCount = [sc.O, sc.C, sc.E, sc.A, sc.N].filter(v => v >= 4.5 || v <= 1.5).length;
  if (extremeCount >= 4) {
    delusionScore += 3;
    delusionD.push(`คะแนนสุดขั้ว ${extremeCount}/5 มิติ — ผิดปกติมาก อาจไม่สะท้อนตัวตนจริง`);
  } else if (extremeCount >= 3) {
    delusionScore += 1;
    delusionD.push(`คะแนนสุดขั้ว ${extremeCount}/5 มิติ — ควรสังเกตเพิ่ม`);
  }

  // ── 3. โปรไฟล์หวาดระแวงรุนแรง (Paranoid Profile) ──
  // ไม่ไว้ใจใคร + กังวลสูงมาก + ไม่เข้าสังคมเลย
  if (sc.A <= 1.5 && sc.N >= 4.5 && sc.E <= 1.5) {
    delusionScore += 3;
    delusionD.push('โปรไฟล์หวาดระแวงรุนแรง — ไม่ไว้ใจใคร + กังวลสูงสุด + ไม่เข้าสังคมเลย');
  } else if (sc.A <= 2.0 && sc.N >= 4.0 && sc.E <= 2.0) {
    delusionScore += 2;
    delusionD.push('แนวโน้มหวาดระแวง — ไม่ค่อยไว้ใจคน + กังวลสูง + เก็บตัวมาก');
  }

  // SCR-PAR สูงมาก
  if ((scr['PAR'] || 0) >= 3) {
    delusionScore += 2;
    delusionD.push('สัญญาณหวาดระแวงจากคำถามพฤติกรรม (SCR-PAR ≥ 3)');
  }

  // ── 4. คำตอบขัดกันรุนแรง (Severe Contradiction) ──
  // อาจไม่รู้จักตัวเองจริงๆ หรือมีหลายตัวตนที่ขัดกัน
  if (confidence.details.con_checks >= 3) {
    delusionScore += 2;
    delusionD.push(`คำตอบขัดกันรุนแรง ${confidence.details.con_checks} จุด — อาจไม่เข้าใจตัวเองหรือมีภาวะแยกตัวตน`);
  } else if (confidence.details.con_checks >= 2) {
    delusionScore += 1;
    delusionD.push(`คำตอบขัดกัน ${confidence.details.con_checks} จุด`);
  }

  // ── 5. ตอบเร็วผิดปกติ (Speed Anomaly) ──
  // ตอบเร็วเกิน 2 วินาทีต่อข้อ ≥ 50% ของคำถามทั้งหมด
  // อาจตอบโดยไม่ได้อ่าน หรือไม่สนใจ
  const answersWithLatency = answers.filter(a => a.latency_ms != null && a.latency_ms > 0);
  if (answersWithLatency.length > 0) {
    const fastCount = answersWithLatency.filter(a => (a.latency_ms || 9999) < 2000).length;
    const fastRatio = fastCount / answersWithLatency.length;
    if (fastRatio >= 0.5) {
      delusionScore += 2;
      delusionD.push(`ตอบเร็วผิดปกติ (< 2 วินาที) ${fastCount}/${answersWithLatency.length} ข้อ (${Math.round(fastRatio * 100)}%) — อาจไม่ได้อ่านคำถาม`);
    } else if (fastRatio >= 0.3) {
      delusionScore += 1;
      delusionD.push(`ตอบเร็ว (< 2 วินาที) ${fastCount}/${answersWithLatency.length} ข้อ (${Math.round(fastRatio * 100)}%)`);
    }
  }

  // ── 6. INF สูง + ผลสุดขั้ว (Invalid + Extreme = อาจไม่ใช่คำตอบจริง) ──
  if (confidence.details.inf >= 1 && extremeCount >= 2) {
    delusionScore += 2;
    delusionD.push('ตอบผิดปกติ (INF) + ผลสุดขั้วหลายมิติ — ผลอาจไม่สะท้อนตัวตนจริง');
  }

  // ── 7. "สมบูรณ์แบบเกินจริง" (Too Perfect Profile) ──
  // O สูง + C สูง + E สูง + A สูง + N ต่ำ = "คนสมบูรณ์แบบ" ← แทบไม่มีจริง
  if (sc.O >= 4.0 && sc.C >= 4.0 && sc.E >= 4.0 && sc.A >= 4.0 && sc.N <= 2.0) {
    delusionScore += 3;
    delusionD.push('โปรไฟล์สมบูรณ์แบบเกินจริง — ทุกมิติดีหมดและไม่มีข้อเสียเลย (แทบไม่มีคนจริงที่เป็นแบบนี้)');
  }

  // กำหนดระดับและการดำเนินการ
  let delusionLevel = '';
  let delusionAction = '';
  if (delusionScore >= 7) {
    delusionLevel = '🔴';
    delusionAction = 'ส่งต่อผู้เชี่ยวชาญทันที — ผลแบบประเมินอาจไม่น่าเชื่อถือ';
  } else if (delusionScore >= 5) {
    delusionLevel = '🟠';
    delusionAction = 'แนะนำให้ทำแบบประเมินซ้ำกับผู้เชี่ยวชาญดูแล';
  } else if (delusionScore >= 3) {
    delusionLevel = '🟡';
    delusionAction = 'สังเกตเพิ่มเติม — ผลอาจไม่สะท้อนตัวตนทั้งหมด';
  }

  const delusion: DelusionSignal = {
    score: delusionScore,
    level: delusionLevel,
    details: delusionD,
    action: delusionAction,
  };

  return { adhd, burnout, ocd, socialAnxiety, delusion };
}

// ═══ BRIGHT Flag ═══
export function calcBrightFlag(sc: Scores, jungian: string, flags: Flags) {
  const hasRisk = flags.rain.level || flags.bolt.level || flags.fog.level || flags.battery.level;
  if (sc.O >= 4.5 && sc.N >= 3.5 && sc.E <= 3.0) return { flag: hasRisk ? '⚗️' : '💎', type: 'Type 1: Intense Creator' };
  if (sc.N >= 3.5 && sc.E >= 3.5 && sc.A <= 2.5) return { flag: hasRisk ? '⚗️' : '💎', type: 'Type 2: Justice Seeker' };
  if (sc.C >= 4.5 && sc.N >= 3.5 && sc.WHO5 <= 12) return { flag: '⚗️', type: 'Type 3: Hyper-Achiever' };
  if (sc.E >= 4.5 && sc.N >= 3.5 && sc.A >= 3.5 && sc.WHO5 <= 12) return { flag: '⚗️', type: 'Type 4: Misunderstood Connector' };
  if (sc.N >= 3.0 && sc.O >= 3.5 && sc.E <= 2.5) return { flag: '🌱', type: 'Hidden Creative' };
  return { flag: '', type: '' };
}

// ═══ Archetype ID (96 mode) ═══
export function calcArchetypeId(sc: Scores, answers: Answer[], quadrant: string): ArchetypeResult {
  const via = calcViaScores(answers);
  let topV = Object.entries(via).reduce((a, b) => a[1] >= b[1] ? a : b)[0];
  const totalVia = Object.values(via).reduce((a, b) => a + b, 0);
  if (totalVia === 0) topV = quadrant === 'Q1' ? 'W' : quadrant === 'Q2' ? 'W' : quadrant === 'Q3' ? 'H' : 'T';
  const jung = calcJungian(answers, sc);
  return { id: `Y_${topV}-${quadrant}-${jung.type}`, fallback_original: '', fallback_level: '' };
}

// ═══ Hybrid Compatibility Engine v2.0 ═══
const VIA_C: Record<string, number> = {
  'W-W':1.0,'W-C':0.6,'W-H':0.7,'W-J':0.5,'W-T':0.4,'W-Tr':0.8,
  'C-C':1.0,'C-H':0.5,'C-J':0.8,'C-T':0.4,'C-Tr':0.6,
  'H-H':1.0,'H-J':0.7,'H-T':0.6,'H-Tr':0.9,
  'J-J':1.0,'J-T':0.6,'J-Tr':0.5,'T-T':1.0,'T-Tr':0.7,'Tr-Tr':1.0
};
const QD_C: Record<string, number> = {
  'Q1-Q1':0.6,'Q1-Q2':0.7,'Q1-Q3':0.7,'Q1-Q4':0.9,
  'Q2-Q2':0.5,'Q2-Q3':0.8,'Q2-Q4':0.6,
  'Q3-Q3':0.6,'Q3-Q4':0.7,'Q4-Q4':0.5,
};
const JG_C: Record<string, number> = {
  'TJ-TJ':0.6,'TJ-TP':0.8,'TJ-FJ':0.8,'TJ-FP':0.5,
  'TP-TP':0.6,'TP-FJ':0.6,'TP-FP':0.8,
  'FJ-FJ':0.6,'FJ-FP':0.8,'FP-FP':0.6,
};
function gc(map: Record<string, number>, a: string, b: string): number {
  return map[`${a}-${b}`] ?? map[`${b}-${a}`] ?? 0.5;
}
export function calcCompatScore(arcA: string, arcB: string): number {
  const m1 = arcA.match(/Y_(\w+)-(\w+)-(\w+)/), m2 = arcB.match(/Y_(\w+)-(\w+)-(\w+)/);
  if (!m1 || !m2) return 0;
  return Math.round((gc(VIA_C, m1[1], m2[1]) * 0.5 + gc(QD_C, m1[2], m2[2]) * 0.3 + gc(JG_C, m1[3], m2[3]) * 0.2) * 100) / 100;
}

export const ALL_96: string[] = [];
for (const v of ['W','C','H','J','T','Tr'])
  for (const q of ['Q1','Q2','Q3','Q4'])
    for (const j of ['TJ','TP','FJ','FP'])
      ALL_96.push(`Y_${v}-${q}-${j}`);

// ═══ Confidence Score ═══
export function calcConfidence(answers: Answer[], sc: Scores): Confidence {
  let sd = 0, inf = 0;
  const con: { dim: string; val: number }[] = [];
  for (const a of answers) {
    for (const part of (a.score_raw || '').split('|')) {
      const m = part.match(/ATT-(\w+):([\+\-]?\d+\.?\d*)/);
      if (!m) continue;
      if (m[1] === 'SD') sd += parseFloat(m[2]);
      if (m[1] === 'INF') inf += parseFloat(m[2]);
      if (m[1].startsWith('CON-')) con.push({ dim: m[1].replace('CON-',''), val: parseFloat(m[2]) });
    }
  }
  let score = 100;
  const warnings: string[] = [];
  if (sd >= 2) { score -= 25; warnings.push('ตอบดีเกินจริง — คำตอบอาจไม่สะท้อนตัวตนจริง'); } else if (sd >= 1) score -= 10;
  if (inf >= 1) { score -= 30; warnings.push('ตอบผิดปกติ — สงสัยว่าอาจตอบโดยไม่ได้อ่านคำถาม'); }
  for (const c of con) {
    const actual = (sc as any)[c.dim] || 0;
    if (Math.abs(actual - c.val) >= 2.0) { score -= 15; warnings.push(`คำตอบขัดกันในมิติ ${c.dim}`); }
  }
  score = Math.max(0, Math.min(100, score));
  return { score, level: score >= 80 ? 'สูง' : score >= 50 ? 'ปานกลาง' : 'ต่ำ', warnings, details: { sd, inf, con_checks: con.length } };
}

// ═══ Indian Dosha ═══
export function calcDosha(sc: Scores, jungian: string): string {
  let v = 0, p = 0, k = 0;
  if (sc.O >= 3.5) v += 2; else if (sc.O >= 3.0) v += 1;
  if (sc.N >= 3.5) v += 2; else if (sc.N >= 3.0) v += 1;
  if (sc.C >= 3.5) p += 2; else if (sc.C >= 3.0) p += 1;
  if (sc.E >= 3.5) p += 2; else if (sc.E >= 3.0) p += 1;
  if (sc.A >= 3.5) k += 2; else if (sc.A >= 3.0) k += 1;
  if (sc.N <= 2.0) k += 2; else if (sc.N <= 2.5) k += 1;
  if (sc.E <= 2.0) k += 1;
  if (jungian?.includes('P')) v += 1;
  if (jungian?.includes('T')) p += 1;
  if (jungian?.includes('J')) p += 1;
  if (v >= p && v >= k) return 'Vata (วาตะ - ลม)';
  if (p >= v && p >= k) return 'Pitta (ปิตตะ - ไฟ)';
  return 'Kapha (กผะ - ดิน/น้ำ)';
}

// ═══ Thai Element ═══
export function calcThaiElement(month: number): string {
  if (month >= 10 && month <= 12) return 'ธาตุดิน';
  if (month >= 1 && month <= 3) return 'ธาตุไฟ';
  if (month >= 4 && month <= 6) return 'ธาตุลม';
  if (month >= 7 && month <= 9) return 'ธาตุน้ำ';
  return '';
}

// ═══ Chinese Element ═══
export function calcChineseElement(year: number, month: number, day: number): string {
  let ey = year;
  if (month * 100 + day < 204) ey = year - 1;
  const d = ey % 10;
  const m: Record<number, string> = {0:'ธาตุทอง (Metal)',1:'ธาตุทอง (Metal)',2:'ธาตุน้ำ (Water)',3:'ธาตุน้ำ (Water)',4:'ธาตุไม้ (Wood)',5:'ธาตุไม้ (Wood)',6:'ธาตุไฟ (Fire)',7:'ธาตุไฟ (Fire)',8:'ธาตุดิน (Earth)',9:'ธาตุดิน (Earth)'};
  return m[d] || '';
}

// ═══ DVJ ID Generator ═══
export function generateDVJId(input: string): string {
  const rev = input.split('').reverse().join('');
  const map: Record<string, string> = {'0':'Z','1':'A','2':'B','3':'C','4':'D','5':'E','6':'F','7':'G','8':'H','9':'I'};
  let hash = '';
  for (const ch of rev) hash += map[ch] || ch;
  return 'DEM-' + hash;
}