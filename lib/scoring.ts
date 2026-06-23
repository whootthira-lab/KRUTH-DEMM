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

// ═══════════════════════════════════════════════════════════════════════
// KRUTH MIND Core Engine v2.5 / v3.0 - Team Synergy & Sports Engine Math
// ═══════════════════════════════════════════════════════════════════════

export interface SimProfile {
  user_id: string;
  full_name: string;
  gender?: string;
  thai_element?: string;
  chinese_element?: string;
  score_o?: number;
  score_c?: number;
  score_e?: number;
  score_a?: number;
  score_n?: number;
  quadrant_primary?: string;
  via_dominant?: string;
  via_scores?: Record<string, number>;
  jungian_type?: string;
  jungian_scores?: Record<string, number>;
  kwi?: {
    vitality: number;
    meaning: number;
    connection: number;
    mastery: number;
    resilience: number;
  };
  delta_tilt?: {
    anger: number;
    aggression: number;
  };
  // NEW Phase 2 elements
  activity_evaluations?: {
    performance_rating: number;
    activity_name: string;
    qualitative_notes?: string;
  }[];
  conflict_risk_users?: string[];
  has_conflict_risk?: boolean;
}

// 1. Pairwise Compatibility Matrix v2.0
export function calcPairwiseCompatibility(a: SimProfile, b: SimProfile): number {
  // Score_VIA
  const viaA = a.via_dominant || '';
  const viaB = b.via_dominant || '';
  let scoreVia = 0.6; // default neutral
  const isViaPair = (x: string, y: string, k1: string, k2: string) => 
    (x === k1 && y === k2) || (x === k2 && y === k1);

  if (isViaPair(viaA, viaB, 'H', 'Tr')) scoreVia = 0.9;
  else if (isViaPair(viaA, viaB, 'J', 'C')) scoreVia = 0.8;
  else if (isViaPair(viaA, viaB, 'W', 'Tr')) scoreVia = 0.8;
  else if (isViaPair(viaA, viaB, 'C', 'J')) scoreVia = 0.8;
  else if (isViaPair(viaA, viaB, 'W', 'T')) scoreVia = 0.4;
  else if (isViaPair(viaA, viaB, 'C', 'T')) scoreVia = 0.4;

  // Score_Quad
  const quadA = a.quadrant_primary || '';
  const quadB = b.quadrant_primary || '';
  let scoreQuad = 0.6; // default neutral
  const isQuadPair = (x: string, y: string, k1: string, k2: string) => 
    (x === k1 && y === k2) || (x === k2 && y === k1);

  if (isQuadPair(quadA, quadB, 'Q1', 'Q4')) scoreQuad = 0.9;
  else if (isQuadPair(quadA, quadB, 'Q2', 'Q3')) scoreQuad = 0.8;
  else if (quadA === 'Q4' && quadB === 'Q4') scoreQuad = 0.5;

  // Score_Jung
  const jungA = a.jungian_type || '';
  const jungB = b.jungian_type || '';
  let scoreJung = 0.6; // default neutral
  const isJungPair = (x: string, y: string, k1: string, k2: string) => 
    (x === k1 && y === k2) || (x === k2 && y === k1);

  if (isJungPair(jungA, jungB, 'TJ', 'FJ')) scoreJung = 0.8;
  else if (isJungPair(jungA, jungB, 'TJ', 'TP')) scoreJung = 0.8;
  else if (isJungPair(jungA, jungB, 'TP', 'FP')) scoreJung = 0.8;
  else if (isJungPair(jungA, jungB, 'FJ', 'FP')) scoreJung = 0.8;
  else if (isJungPair(jungA, jungB, 'TJ', 'FP')) scoreJung = 0.5;

  const raw = 0.4 * scoreVia + 0.3 * scoreQuad + 0.3 * scoreJung;
  const rawDiff = raw - 0.4;
  const safeDiff = rawDiff < 0 ? 0 : rawDiff;
  return Math.max(15, Math.min(98, (safeDiff / 0.5) * 100));
}

// 2. Wu Xing Element Harmony Integration
export function calcWuXingScore(a: SimProfile, b: SimProfile): number {
  const getEl = (str: string) => {
    if (!str) return '';
    if (str.includes('Wood') || str.includes('ไม้')) return 'Wood';
    if (str.includes('Fire') || str.includes('ไฟ')) return 'Fire';
    if (str.includes('Earth') || str.includes('ดิน')) return 'Earth';
    if (str.includes('Metal') || str.includes('ทอง')) return 'Metal';
    if (str.includes('Water') || str.includes('น้ำ')) return 'Water';
    return '';
  };
  const elA = getEl(a.chinese_element || a.thai_element || '');
  const elB = getEl(b.chinese_element || b.thai_element || '');

  if (!elA || !elB) return 1.0;
  if (elA === elB) return 1.0;

  // Promoting Cycle: Wood -> Fire -> Earth -> Metal -> Water -> Wood
  const isPromoting = (x: string, y: string) => {
    const pairs = [['Wood','Fire'], ['Fire','Earth'], ['Earth','Metal'], ['Metal','Water'], ['Water','Wood']];
    return pairs.some(p => (p[0] === x && p[1] === y) || (p[0] === y && p[1] === x));
  };

  if (isPromoting(elA, elB)) return 1.0;
  return 0.4;
}

// 3. Combined Compatibility Score (75% Psych + 25% Wu Xing)
export function calcCombinedScore(a: SimProfile, b: SimProfile): number {
  const compat = calcPairwiseCompatibility(a, b);
  const wuXing = calcWuXingScore(a, b);
  return 0.25 * (wuXing * 100) + 0.75 * compat;
}

// 4. Task-Specific Potential Matrix
export function calcTaskPotential(members: SimProfile[], projectType: string): { score: number; comeback?: number } {
  if (members.length === 0) return { score: 3.0 };

  const len = members.length;
  let oSum = 0, cSum = 0, eSum = 0, aSum = 0, nSum = 0, rSum = 0, tSum = 0;
  let q1Count = 0, q3Count = 0, q4Count = 0;
  let angerSum = 0, aggressionSum = 0, tiltCount = 0;

  members.forEach(m => {
    oSum += m.score_o ?? 3.0;
    cSum += m.score_c ?? 3.0;
    eSum += m.score_e ?? 3.0;
    aSum += m.score_a ?? 3.0;
    nSum += m.score_n ?? 3.0;
    rSum += m.kwi?.resilience ?? 3.0;
    tSum += m.via_scores?.T ?? 3.0; // T stands for Temperance

    if (m.quadrant_primary === 'Q1') q1Count++;
    if (m.quadrant_primary === 'Q3') q3Count++;
    if (m.quadrant_primary === 'Q4') q4Count++;

    if (m.delta_tilt) {
      angerSum += m.delta_tilt.anger;
      aggressionSum += m.delta_tilt.aggression;
      tiltCount++;
    }
  });

  const avgO = oSum / len;
  const avgC = cSum / len;
  const avgE = eSum / len;
  const avgA = aSum / len;
  const avgN = nSum / len;
  const avgR = rSum / len;
  const avgT = tSum / len;

  const q1Density = q1Count / len;
  const q3Density = q3Count / len;
  const q4Density = q4Count / len;

  const avgAnger = tiltCount > 0 ? angerSum / tiltCount : 0.0;
  const avgAggression = tiltCount > 0 ? aggressionSum / tiltCount : 0.0;
  const deltaTilt = avgAnger * avgAggression;

  // Comeback Capability (Clutch Factor)
  const comeback = Math.max(1.0, Math.min(5.0, (0.4 * avgR + 0.3 * (5 - avgN) + 0.3 * avgT) - 0.2 * deltaTilt));

  let score = 3.0;
  if (projectType === 'innovation') {
    score = Math.max(1.0, Math.min(5.0, 0.6 * avgO + 0.4 * (q1Density * 5.0)));
  } else if (projectType === 'execution') {
    score = Math.max(1.0, Math.min(5.0, 0.6 * avgC + 0.4 * (q4Density * 5.0)));
  } else if (projectType === 'crisis_management') {
    score = Math.max(1.0, Math.min(5.0, 0.5 * (5 - avgN) + 0.5 * avgR));
  } else if (projectType === 'cohesion') {
    score = Math.max(1.0, Math.min(5.0, 0.6 * ((avgA + avgE) / 2) + 0.4 * (q3Density * 5.0)));
  } else if (projectType === 'combat' || projectType === 'combat_sports') {
    score = comeback;
  } else if (projectType === 'esports_rov_assassin' || projectType === 'assassin') {
    score = Math.max(1.0, Math.min(5.0, 0.4 * avgE + 0.3 * avgO + 0.3 * (5.0 - avgA)));
  } else if (projectType === 'esports_rov_mage' || projectType === 'mage') {
    score = Math.max(1.0, Math.min(5.0, 0.4 * avgO + 0.3 * avgC + 0.3 * (5.0 - avgN)));
  } else if (projectType === 'esports_rov_fighter' || projectType === 'fighter') {
    score = Math.max(1.0, Math.min(5.0, 0.4 * avgC + 0.3 * avgA + 0.3 * avgR));
  } else if (projectType === 'esports_rov_carry' || projectType === 'esports_rov_marksman' || projectType === 'carry' || projectType === 'marksman') {
    score = Math.max(1.0, Math.min(5.0, 0.5 * avgC + 0.3 * (5.0 - avgN) + 0.2 * avgR));
  } else if (projectType === 'esports_rov_tank' || projectType === 'tank') {
    score = Math.max(1.0, Math.min(5.0, 0.4 * avgA + 0.3 * avgR + 0.3 * avgT));
  } else if (projectType === 'esports_rov_support' || projectType === 'support') {
    score = Math.max(1.0, Math.min(5.0, 0.4 * avgA + 0.4 * avgE + 0.2 * avgT));
  } else if (projectType === 'rov' || projectType === 'esports_rov') {
    score = comeback;
  }

  // Integrate manual activity evaluations into calculation
  let evalSum = 0;
  let evalCount = 0;
  members.forEach(m => {
    if (m.activity_evaluations && m.activity_evaluations.length > 0) {
      const mSum = m.activity_evaluations.reduce((s, ev) => s + Number(ev.performance_rating), 0);
      evalSum += mSum / m.activity_evaluations.length;
      evalCount++;
    }
  });

  if (evalCount > 0) {
    const avgEval = evalSum / evalCount;
    // Blend the manual activity rating (30% weight) with the trait-based task potential score (70% weight)
    score = Math.max(1.0, Math.min(5.0, 0.7 * score + 0.3 * avgEval));
  }

  return { score, comeback };
}

// 5. Full Team Synergy Index
export function calcTeamSynergy(members: SimProfile[], projectType: string): { 
  synergy: number; 
  taskPotential: number; 
  comeback: number;
  isConflictPenaltyApplied?: boolean;
} {
  if (members.length === 0) return { synergy: 0, taskPotential: 0.0, comeback: 0.0 };

  let sumCombined = 0;
  let countPairs = 0;
  const len = members.length;

  for (let i = 0; i < len; i++) {
    for (let j = i + 1; j < len; j++) {
      sumCombined += calcCombinedScore(members[i], members[j]);
      countPairs++;
    }
  }

  const avgCombined = countPairs > 0 ? sumCombined / countPairs : 50.0;
  const { score: taskPotential, comeback } = calcTaskPotential(members, projectType);

  // Synergy = 0.6 * AvgCombined + 0.4 * (TaskPotential * 20)
  const rawSynergy = 0.6 * avgCombined + 0.4 * (taskPotential * 20);
  let synergy = Math.round(rawSynergy);

  // Check for conflict penalty: placing members with active conflict_risk tag or conflict_risk_users relationship
  let isConflictPenaltyApplied = false;
  
  // A general conflict flag or specific pairing conflict
  members.forEach(m => {
    if (m.has_conflict_risk) {
      isConflictPenaltyApplied = true;
    }
    if (m.conflict_risk_users && m.conflict_risk_users.some(id => members.some(other => other.user_id === id))) {
      isConflictPenaltyApplied = true;
    }
  });

  if (isConflictPenaltyApplied) {
    // 15% synergy score deduction
    synergy = Math.round(synergy * 0.85);
  }

  return { synergy, taskPotential, comeback: comeback || 3.0, isConflictPenaltyApplied };
}

// 5.1 Voice Volatility Index (VVI) Calculation
export function calcVoiceVolatility(
  pitchRatio: number,
  speechRate: number,
  negativeKeywordDensity: number,
  w1: number = 0.5,
  w2: number = 0.5
): number {
  // VVI = (w1 * Pitch_Ratio + w2 * Speech_Rate) * (1 + Negative_Keyword_Density)
  const rawVvi = (w1 * pitchRatio + w2 * speechRate) * (1 + negativeKeywordDensity);
  return parseFloat(Math.max(1.0, Math.min(5.0, rawVvi)).toFixed(2));
}

// 5.2 Accessibility Typing Stress Proxy (CDI Calculation)
export interface UserHistoricalBaseline {
  avg_latency_ms: number;
  avg_error_rate: number;
}

export function calcTypingStressProxy(
  currentAnswers: Answer[],
  baseline: UserHistoricalBaseline | null
): { acuteStressDetected: boolean; detailScore: number } {
  if (!baseline || baseline.avg_latency_ms === 0) return { acuteStressDetected: false, detailScore: 0 };

  const validAnswers = currentAnswers.filter(a => a.latency_ms && a.latency_ms > 0);
  if (validAnswers.length === 0) return { acuteStressDetected: false, detailScore: 0 };

  const currentAvgLatency = validAnswers.reduce((sum, a) => sum + (a.latency_ms || 0), 0) / validAnswers.length;
  
  // Estimate backspace rate from changed answers count in this session
  const changedAnswers = currentAnswers.filter(a => a.changed);
  const currentAvgErrorRate = currentAnswers.length > 0 ? changedAnswers.length / currentAnswers.length : 0;

  const w1 = 0.6;
  const w2 = 0.4;

  const lBar = baseline.avg_latency_ms;
  const eBar = baseline.avg_error_rate || 0.05;

  const cdi = w1 * (currentAvgLatency / lBar) + w2 * (currentAvgErrorRate / eBar);

  return {
    acuteStressDetected: cdi > 1.5,
    detailScore: parseFloat(cdi.toFixed(2))
  };
}

export interface BehavioralMetrics {
  typingSpeedCpm: number;
  backspaceCount: number;
  backspaceRatio: number;
  averageFocusToClickLatencyMs: number;
}

export interface UserRunningSession {
  baselineLatencyMs: number;
  baselineBackspaceRatio: number;
}

export function estimateStressFromBehavioral(
  metrics: BehavioralMetrics,
  baseline: UserRunningSession
): string {
  const lBar = baseline.baselineLatencyMs || 2000;
  const eBar = baseline.baselineBackspaceRatio || 0.05;

  const currentLatency = metrics.averageFocusToClickLatencyMs;
  const currentBackspaceRatio = metrics.backspaceRatio;

  const w1 = 0.6;
  const w2 = 0.4;

  const cdi = w1 * (currentLatency / lBar) + w2 * (currentBackspaceRatio / eBar);

  if (cdi > 1.5) {
    return 'TILT';
  } else if (cdi < 0.5) {
    return 'HYPE';
  } else {
    return 'CALM';
  }
}


// 6. Esports RoV Match Engine
export interface RoVHero {
  id: string;
  hero_name_th: string;
  hero_name_en: string;
  primary_role: string;
  element_seed: Record<string, number>;
  tactical_tags: string[];
  base_archetype?: string | null;
}

export function calcPredictedResourceGreed(m: SimProfile): number {
  const o = m.score_o ?? 3.0;
  const a = m.score_a ?? 3.0;
  const c = m.score_c ?? 3.0;
  const greed = (o + (5 - a) + (5 - c)) / 3.0;
  return parseFloat(greed.toFixed(2));
}

export function calcPredictedResourceSharing(m: SimProfile): number {
  const a = m.score_a ?? 3.0;
  const c = m.score_c ?? 3.0;
  const e = m.score_e ?? 3.0;
  const conn = m.kwi?.connection ?? 3.0;
  const sharing = (a + c + e + conn) / 4.0;
  return parseFloat(sharing.toFixed(2));
}

export function calcRoVMatchCapability(
  teamSynergy: number,
  comeback: number,
  opponentData: { element_fire_pct: number; aggression: number } | null,
  teamMembers: SimProfile[],
  selectedHeroes?: Record<string, RoVHero | null>,
  opponentHeroes?: (RoVHero | null)[]
): {
  capability: number;
  counterIndex: number;
  buildRecommendations?: Record<string, { buildName: string; items: string[]; tags: string[]; skills: string[]; runes: string[] }>;
  rreAlerts?: string[];
  crsiAlerts?: string[];
} {
  let counterIndex = 0.50; // default neutral
  const rreAlerts: string[] = [];
  const crsiAlerts: string[] = [];
  const buildRecommendations: Record<string, { buildName: string; items: string[]; tags: string[]; skills: string[]; runes: string[] }> = {};

  if (selectedHeroes && opponentHeroes && opponentHeroes.length > 0) {
    const activeOpponents = opponentHeroes.filter((h): h is RoVHero => !!h);
    const activePicks = Object.values(selectedHeroes).filter((h): h is RoVHero => !!h);

    // 1. Anti-Snowball Circuit
    const oppHasSnowball = activeOpponents.some(h => 
      h.tactical_tags?.includes('early_snowball') || h.tactical_tags?.includes('jungle_invader')
    );
    const ourHasTJ = teamMembers.some(m => {
      const hero = selectedHeroes[m.user_id];
      return hero && m.jungian_type?.includes('TJ');
    });

    if (oppHasSnowball && ourHasTJ) {
      counterIndex += 0.25;
    }

    // 2. Anti-Control Matchup
    const oppHasHardCC = activeOpponents.some(h => 
      h.tactical_tags?.includes('hard_cc')
    );
    const ourHasAntiControl = activePicks.some(h => 
      h.tactical_tags?.includes('anti_control') || h.tactical_tags?.includes('cc_purify_ultimate')
    );

    if (oppHasHardCC && ourHasAntiControl) {
      counterIndex += 0.25;
    }

    counterIndex = Math.max(0.15, Math.min(0.98, counterIndex));

    // 3. Dynamic Build Recommendation & RRE / Crsi checking
    teamMembers.forEach(m => {
      const hero = selectedHeroes[m.user_id];
      if (!hero) return;

      const role = hero.primary_role; // 'Assassin', 'Mage', 'Fighter', 'Marksman', 'Tank', 'Support'
      const isAggressive = (m.quadrant_primary === 'Q1' || m.quadrant_primary === 'Q4' || (m.score_e ?? 3.0) > 3.5);

      if (role === 'Marksman') {
        const rre = calcPredictedResourceGreed(m);
        const hasGreedTag = hero.tactical_tags?.includes('resource_greed') || hero.tactical_tags?.includes('late_scaling');
        if (hasGreedTag && rre >= 1.5) {
          rreAlerts.push(`${m.full_name} (${hero.hero_name_en}) มีระดับความละโมบทรัพยากรสูง (R_RE = ${rre.toFixed(1)}): ทีมโรมมิ่งควรคอยช่วยเหลือดูแลเลนลึก`);
        }
      }

      if (role === 'Tank' || role === 'Support') {
        const crsi = calcPredictedResourceSharing(m);
        const hasProtectTag = hero.tactical_tags?.includes('backline_protector') || hero.tactical_tags?.includes('peel_expert');
        if (hasProtectTag && crsi >= 1.4) {
          crsiAlerts.push(`${m.full_name} (${hero.hero_name_en}) อุทิศตัวช่วยความอยู่รอดทีมสูงสุด (C_rsi = ${crsi.toFixed(1)}): ได้รับเสนอชื่อเป็น Facilitator / Morale Booster`);
        }
      }

      // 3.1 Determine Runes (Red, Purple, Green)
      let runes: string[] = [];
      if (role === 'Mage') {
        runes = ['Violate', 'Spirit', 'Flurry'];
      } else if (role === 'Tank' || role === 'Support') {
        runes = ['Awakened', 'Protect', 'Valiancy'];
      } else if (role === 'Marksman') {
        runes = ['Rampage', 'Guerrilla', 'Dragon\'s Claw'];
      } else {
        // Fighter / Assassin
        if (isAggressive) {
          runes = ['Onslaught', 'Assassinate', 'Dragon\'s Claw'];
        } else {
          runes = ['Onslaught', 'Protect', 'Skewer'];
        }
      }

      // 3.2 Determine Challenger Skills
      let skills: string[] = [];
      if (role === 'Assassin') {
        skills = ['Punish', 'Flicker'];
      } else if (role === 'Marksman') {
        skills = oppHasHardCC ? ['Flicker', 'Purify'] : ['Flicker', 'Sprint'];
      } else if (role === 'Mage') {
        skills = oppHasHardCC ? ['Flicker', 'Purify'] : ['Flicker', 'Heal'];
      } else if (role === 'Tank' || role === 'Support') {
        skills = oppHasHardCC ? ['Purify', 'Heal'] : ['Heal', 'Disrupt'];
      } else {
        // Fighter
        skills = oppHasHardCC ? ['Flicker', 'Purify'] : ['Flicker', 'Execute'];
      }

      // 3.3 Determine Build Name, Items, and Tags
      let buildName = 'Semi-Fighter / Bruiser';
      let items: string[] = [];
      let tags: string[] = ['SAFE_PLAY_BRUISER'];

      const isShoesSpecial = oppHasHardCC;

      if (role === 'Marksman') {
        if (isAggressive) {
          buildName = 'Full Damage / Critical Carry';
          items = [
            isShoesSpecial ? 'Gilded Greaves' : 'Sonic Greaves',
            'Claves Sancti',
            'Slikk\'s Sting',
            'Omni Arms',
            'Fenrir\'s Tooth'
          ];
          tags = ['HIGH_RISK_FULL_DAMAGE'];
        } else {
          buildName = 'Safe / Bruiser Carry';
          items = [
            isShoesSpecial ? 'Gilded Greaves' : 'Sonic Greaves',
            'Spear of Longinus',
            'Claves Sancti',
            'Shield of the Lost',
            'Blade of Eternity'
          ];
          tags = ['SAFE_PLAY_BRUISER'];
        }
      } else if (role === 'Mage') {
        if (isAggressive) {
          buildName = 'Full Magic Burst';
          items = ['Gilded Greaves', 'Boomstick', 'Hecate\'s Diadem', 'Staff of Nuul', 'Blade of Eternity'];
          tags = ['HIGH_RISK_FULL_DAMAGE'];
        } else {
          buildName = 'Sustain Magic Bruiser';
          items = ['Gilded Greaves', 'Rhea\'s Blessing', 'Boomstick', 'Staff of Nuul', 'Medallion of Troy'];
          tags = ['SAFE_PLAY_BRUISER'];
        }
      } else if (role === 'Tank' || role === 'Support') {
        if (role === 'Support') {
          buildName = 'Team Aura Support';
          items = ['Genesis', 'Gilded Greaves', 'The Aegis', 'Shield of the Lost', 'Gaia\'s Standard'];
          tags = ['ALL_PROFILES'];
        } else {
          buildName = 'Full Crowd Control Tank';
          items = [
            isShoesSpecial ? 'Gilded Greaves' : 'Sonic Greaves',
            'The Aegis',
            'Shield of the Lost',
            'Gaia\'s Standard',
            'Blade of Eternity'
          ];
          tags = ['SAFE_PLAY_BRUISER'];
        }
      } else if (role === 'Assassin') {
        if (isAggressive) {
          buildName = 'Full Damage Assassin';
          items = ['Soulriever', 'Rankbreaker', 'Omni Arms', 'Fenrir\'s Tooth', 'Blade of Eternity'];
          tags = ['HIGH_RISK_FULL_DAMAGE'];
        } else {
          buildName = 'Semi-Tank Jungler';
          items = ['Leviathan', 'Spear of Longinus', 'Omni Arms', 'Shield of the Lost', 'Blade of Eternity'];
          tags = ['SAFE_PLAY_BRUISER'];
        }
      } else {
        // Fighter
        if (isAggressive) {
          buildName = 'Aggressive Fighter';
          items = [
            isShoesSpecial ? 'Gilded Greaves' : 'Sonic Greaves',
            'Spear of Longinus',
            'Omni Arms',
            'Rankbreaker',
            'Blade of Eternity'
          ];
          tags = ['HIGH_RISK_FULL_DAMAGE'];
        } else {
          buildName = 'Semi-Fighter / Bruiser';
          items = [
            isShoesSpecial ? 'Gilded Greaves' : 'Sonic Greaves',
            'Spear of Longinus',
            'Omni Arms',
            'Shield of the Lost',
            'Fenrir\'s Tooth'
          ];
          tags = ['SAFE_PLAY_BRUISER'];
        }
      }

      // 3.4 State Dynamic Override
      const tiltVal = (m.delta_tilt?.anger || 0.0) + (m.delta_tilt?.aggression || 0.0);
      const isHighRiskHero = hero.tactical_tags?.includes('backline_diver') || hero.tactical_tags?.includes('high_risk');

      if (tiltVal >= 3.5 && isHighRiskHero && tags.includes('HIGH_RISK_FULL_DAMAGE')) {
        buildName = `${buildName} (State Override)`;
        tags = ['SAFE_PLAY_BRUISER', 'SURVIVAL_CUSHION'];
        
        // Convert to defensive setup
        if (role === 'Marksman') {
          items = ['Gilded Greaves', 'Spear of Longinus', 'Claves Sancti', 'Shield of the Lost', 'Blade of Eternity'];
        } else if (role === 'Assassin') {
          items = ['Leviathan', 'Spear of Longinus', 'Omni Arms', 'Shield of the Lost', 'Blade of Eternity'];
        } else if (role === 'Mage') {
          items = ['Gilded Greaves', 'Rhea\'s Blessing', 'Boomstick', 'Staff of Nuul', 'Medallion of Troy'];
        } else if (role === 'Fighter') {
          items = ['Sonic Greaves', 'Spear of Longinus', 'Omni Arms', 'Shield of the Lost', 'Blade of Eternity'];
        }
        skills = ['Flicker', 'Purify'];
      }

      buildRecommendations[m.user_id] = { buildName, items, tags, skills, runes };
    });

  } else if (opponentData) {
    const isOpponentEarlySnowball = opponentData.element_fire_pct > 40 && opponentData.aggression > 3.0;
    if (isOpponentEarlySnowball) {
      let waterCount = 0;
      let q2q3Count = 0;
      teamMembers.forEach(m => {
        if (m.chinese_element?.includes('Water') || m.thai_element === 'ธาตุน้ำ') waterCount++;
        if (m.quadrant_primary === 'Q2' || m.quadrant_primary === 'Q3') q2q3Count++;
      });

      if (waterCount >= 1 || q2q3Count >= teamMembers.length / 2) {
        counterIndex = 0.75;
      }
    }
  }

  const rawCap = 0.4 * teamSynergy + 0.3 * (comeback * 20) + 0.3 * (counterIndex * 100);
  const capability = Math.round(rawCap);
  return { capability, counterIndex, buildRecommendations, rreAlerts, crsiAlerts };
}

// 7. Combat Sports individual Dominance
export function calcCombatDominance(
  fighter: SimProfile,
  opponent: SimProfile | null
): { dominance: number; egoPenalty: boolean; styleMultiplier: number; pressure: number } {
  const r = fighter.kwi?.resilience ?? 3.0;
  const m = fighter.kwi?.mastery ?? 3.0;
  const n = fighter.score_n ?? 3.0;
  const o = fighter.score_o ?? 3.0;

  let fighterPsyCap = (r + m + (5 - n)) / 3;

  // Ego Regulation Check (Delusion Penalty)
  const isDelusive = (o >= 4.8 && n <= 1.5) || (fighter.jungian_type === 'TJ' && o >= 4.7 && n <= 1.8);
  if (isDelusive) {
    fighterPsyCap = fighterPsyCap * 0.85;
  }

  // Style Multiplier
  let styleMultiplier = 1.0;
  if (opponent) {
    const isFighterWindCounter = fighter.quadrant_primary === 'Q2' || fighter.chinese_element?.includes('Water') || fighter.chinese_element?.includes('Metal') || fighter.chinese_element?.includes('Wood') || fighter.chinese_element?.includes('Wind') || fighter.thai_element === 'ธาตุลม';
    const isOpponentFireSwarmer = opponent.quadrant_primary === 'Q4' || opponent.chinese_element?.includes('Fire') || opponent.thai_element === 'ธาตุไฟ';
    if (isFighterWindCounter && isOpponentFireSwarmer) {
      styleMultiplier = 1.2;
    }
  }

  // Opponent Pressure
  let pressure = 0.0;
  if (opponent) {
    const opponentAggression = opponent.delta_tilt?.aggression || 0.0;
    pressure = (opponentAggression * n) / 5.0;
  }

  const rawDom = (fighterPsyCap * 20 * styleMultiplier) - (pressure * 10);
  const dominance = Math.max(15, Math.min(98, Math.round(rawDom)));

  return { dominance, egoPenalty: isDelusive, styleMultiplier, pressure };
}

// 8. Friction thresholds by project type
export const FRICTION_THRESHOLDS: Record<string, number> = {
  esports_rov: 3.20,
  innovation: 3.80,
  execution: 3.40,
  crisis_management: 3.00,
  default: 3.50
};

// 9. Helper to get threshold dynamically
export function getFrictionThreshold(projectType: string): number {
  if (projectType.startsWith('esports_rov') || projectType === 'rov') {
    return FRICTION_THRESHOLDS.esports_rov;
  }
  return FRICTION_THRESHOLDS[projectType] || FRICTION_THRESHOLDS.default;
}

// 10. Helper to check Wu Xing balance
export function checkWuXingBalance(members: SimProfile[]): boolean {
  const counts: Record<string, number> = {};
  const getEl = (str: string) => {
    if (!str) return '';
    if (str.includes('Wood') || str.includes('ไม้')) return 'Wood';
    if (str.includes('Fire') || str.includes('ไฟ')) return 'Fire';
    if (str.includes('Earth') || str.includes('ดิน')) return 'Earth';
    if (str.includes('Metal') || str.includes('ทอง')) return 'Metal';
    if (str.includes('Water') || str.includes('น้ำ')) return 'Water';
    return '';
  };
  members.forEach(m => {
    const el = getEl(m.chinese_element || m.thai_element || '');
    if (el) {
      counts[el] = (counts[el] || 0) + 1;
    }
  });
  const maxAllowed = members.length <= 3 ? 2 : Math.floor(members.length * 0.6);
  return Object.values(counts).every(c => c <= maxAllowed);
}

// 11. AI Auto-Grouping Optimization Engine (Hybrid: Exact + Heuristic SA)
export function optimizeGroup(
  pool: SimProfile[],
  groupSize: number,
  projectType: string,
  forcedUserIds: string[] = []
): SimProfile[] {
  if (pool.length < groupSize) return pool;

  const forcedMembers = pool.filter(m => forcedUserIds.includes(m.user_id));
  const remainingPool = pool.filter(m => !forcedUserIds.includes(m.user_id));
  const neededSize = groupSize - forcedMembers.length;

  if (neededSize < 0) {
    return forcedMembers.slice(0, groupSize);
  }
  if (neededSize === 0) {
    return forcedMembers;
  }

  const threshold = getFrictionThreshold(projectType);

  const evaluateGroup = (g: SimProfile[]): number => {
    const avgN = g.reduce((sum, m) => sum + (m.score_n ?? 3.0), 0) / g.length;
    if (avgN > threshold) return -1;

    const hasCohesion = g.some(m => m.jungian_type === 'TJ' || m.jungian_type === 'FJ');
    if (!hasCohesion) return -1;

    if (!checkWuXingBalance(g)) return -1;

    const { synergy } = calcTeamSynergy(g, projectType);
    return synergy;
  };

  const n = remainingPool.length;
  const k = neededSize;

  const getCombinationsCount = (nVal: number, kVal: number): number => {
    if (kVal > nVal || kVal < 0) return 0;
    let res = 1;
    for (let i = 1; i <= kVal; i++) {
      res = res * (nVal - i + 1) / i;
    }
    return res;
  };

  const combCount = getCombinationsCount(n, k);
  const maxExactLimit = 100000;

  if (combCount > 0 && combCount <= maxExactLimit) {
    let bestGroup: SimProfile[] = [];
    let bestScore = -1;

    const combinations: number[][] = [];
    const generateCombinations = (start: number, current: number[]) => {
      if (current.length === k) {
        combinations.push([...current]);
        return;
      }
      for (let i = start; i < n; i++) {
        current.push(i);
        generateCombinations(i + 1, current);
        current.pop();
      }
    };
    generateCombinations(0, []);

    for (const indices of combinations) {
      const candidateGroup = [...forcedMembers, ...indices.map(idx => remainingPool[idx])];
      const score = evaluateGroup(candidateGroup);
      if (score > bestScore) {
        bestScore = score;
        bestGroup = candidateGroup;
      }
    }

    if (bestGroup.length > 0) {
      return bestGroup;
    }
  }

  // Heuristic (Greedy + Simulated Annealing)
  let currentGroup = [...forcedMembers];
  const poolCopy = [...remainingPool];

  while (currentGroup.length < groupSize && poolCopy.length > 0) {
    let bestMemberIdx = -1;
    let bestScore = -1;

    for (let i = 0; i < poolCopy.length; i++) {
      const candidateGroup = [...currentGroup, poolCopy[i]];
      const score = evaluateGroup(candidateGroup);
      if (score > bestScore) {
        bestScore = score;
        bestMemberIdx = i;
      }
    }

    if (bestMemberIdx !== -1) {
      currentGroup.push(poolCopy[bestMemberIdx]);
      poolCopy.splice(bestMemberIdx, 1);
    } else {
      currentGroup.push(poolCopy[0]);
      poolCopy.splice(0, 1);
    }
  }

  let bestGroup = [...currentGroup];
  let bestScore = evaluateGroup(bestGroup);

  const iterations = 500;
  let temp = 100.0;
  const coolingRate = 0.95;

  for (let iter = 0; iter < iterations; iter++) {
    if (bestGroup.length > forcedMembers.length && poolCopy.length > 0) {
      const groupSwapIdx = forcedMembers.length + Math.floor(Math.random() * (bestGroup.length - forcedMembers.length));
      const poolSwapIdx = Math.floor(Math.random() * poolCopy.length);

      const candidateGroup = [...bestGroup];
      const tempMember = candidateGroup[groupSwapIdx];
      candidateGroup[groupSwapIdx] = poolCopy[poolSwapIdx];

      const score = evaluateGroup(candidateGroup);
      const delta = score - bestScore;
      if (score !== -1 && (delta > 0 || Math.random() < Math.exp(delta / temp))) {
        bestScore = score;
        bestGroup = candidateGroup;
        poolCopy[poolSwapIdx] = tempMember;
      }
    }
    temp *= coolingRate;
  }

  return bestGroup;
}