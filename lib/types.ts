export type Band = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export interface Question {
  q_id: string;
  band: string;
  section: string;
  dimension: string;
  question: string;
  choices: { A: string; B: string; C: string; D: string };
  scores: { A: string; B: string; C: string; D: string };
  display_mode: string;
  alert_flag: string;
  branch_trigger: string;
  branch_group: string;
}

export interface Answer {
  q_id: string;
  choice: string;
  score_raw: string;
  dimension: string;
  alert: string;
  latency_ms: number;
  changed: boolean;
}

export interface Scores {
  O: number; C: number; E: number; A: number; N: number;
  WHO5: number; GDS: number; ADL: number;
  pDCR_F: number; pDCR_W: number; pDCR_A: number; pDCR_E: number;
}

export interface QuadrantResult {
  primary: string;
  secondary: string;
  conf_O: number;
  conf_E: number;
  isBorderline: boolean;
}

export interface FlagResult {
  score: number;
  level: string; // 🟡🟠🔴 or ""
}

export interface Flags {
  rain: FlagResult;
  bolt: FlagResult;
  fog: FlagResult;
  battery: FlagResult;
}

export interface ArchetypeResult {
  id: string;
  fallback_original: string;
  fallback_level: string;
}

export interface Archetype {
  id: string;
  name_th: string;
  name_en: string;
  via: string;
  quadrant: string;
  jungian: string;
  short_desc: string;
  long_desc: string;
  strengths: string[];
  challenge: string;
  career_hint: string;
  color: string;
  image_url: string;
  caution: string;
  recommendation: string;
  misunderstand: string;
  social_tips: { Q1: string; Q2: string; Q3: string; Q4: string };
  self_warning: string;
  bright_flag?: string;
  bright_type?: string;
}

export interface CompatResult {
  top3: { id: string; score: number; name_th: string; name_en: string; image_url: string }[];
  hardest: { id: string; score: number; name_th: string; image_url: string } | null;
}

export interface Confidence {
  score: number;
  level: string;
  warnings: string[];
  details: { sd: number; inf: number; con_checks: number };
}

export interface FullResult {
  ok: boolean;
  scores: Scores;
  quadrant: QuadrantResult;
  archetype: Archetype;
  hasRiskFlag: boolean;
  hasBrightFlag: boolean;
  compat: CompatResult;
  dosha: string;
  dayPrediction: { day: string; prediction: string } | null;
  nameElements: { fire: string; earth: string; wind: string; water: string };
  confidence: Confidence;
}

export interface RegData {
  dvjId: string;
  age: number;
  dayOfWeek: string;
  thaiElement: string;
  chineseElement: string;
  zodiac: string;
  zodiacElement: string;
  nameElements: { fire: number; earth: number; wind: number; water: number };
}

export const BAND_INFO: Record<Band, { icon: string; age: string; name: string }> = {
  A: { icon: '🧒', age: '6–7 ปี', name: 'เด็กเล็ก' },
  B: { icon: '👦', age: '8–12 ปี', name: 'ประถม' },
  C: { icon: '🧑', age: '13–17 ปี', name: 'วัยรุ่น' },
  D: { icon: '🧑‍🎓', age: '18–25 ปี', name: 'วัยเริ่มต้น' },
  E: { icon: '👨‍💼', age: '26–41 ปี', name: 'วัยทำงาน' },
  F: { icon: '🧓', age: '42–65 ปี', name: 'วัยกลางคน' },
  G: { icon: '👴', age: '66–80 ปี', name: 'ผู้สูงอายุ' },
};
