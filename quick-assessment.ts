// ═══════════════════════════════════════════════════════════════════
// KRUTH DEMM — Quick Assessment Engine
// lib/quick-assessment.ts
// ประเมิน Quad/Jung/VIA ของ "คนที่ถูกพูดถึง" จาก 3-5 ข้อ
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────────

export type TargetRole =
  | 'boss' | 'colleague' | 'friend' | 'partner'
  | 'classmate' | 'teacher' | 'parent' | 'sibling';

export type QAQuestion = {
  id: 'q1' | 'q2' | 'q3' | 'q4' | 'q5';
  question_th: string;
  choices: { key: 'A' | 'B' | 'C' | 'D' | 'E'; label_th: string }[];
  maps_to: Record<'A' | 'B' | 'C' | 'D' | 'E', {
    quad?: string; jung?: string; via?: string; weight?: number;
  }>;
};

export type QAAnswers = {
  q1?: string; q2?: string; q3?: string; q4?: string; q5?: string;
};

export type QAResult = {
  estimated_quad: string;
  estimated_jung: string;
  estimated_via: string;
  confidence: 'low' | 'medium' | 'high';
  calc_compat: number;
  description_th: string;
};

// ── Question Banks แยกตาม Role ──────────────────────────────────

const QUESTIONS_BY_ROLE: Record<string, QAQuestion[]> = {

  // ── หัวหน้างาน ───────────────────────────────────────────────
  boss: [
    {
      id: 'q1',
      question_th: 'เมื่อเกิดปัญหาในทีม หัวหน้าของคุณมักทำอะไรก่อน?',
      choices: [
        { key: 'A', label_th: 'วิเคราะห์หาสาเหตุคนเดียวก่อน' },
        { key: 'B', label_th: 'ระดมทีมช่วยกันคิดทันที' },
        { key: 'C', label_th: 'ลงมือแก้เลยไม่รอ' },
        { key: 'D', label_th: 'รอให้มีข้อมูลครบก่อนตัดสินใจ' },
      ],
      maps_to: {
        A: { quad: 'Q2', jung: 'TJ', weight: 1.2 },
        B: { quad: 'Q3', jung: 'FJ', weight: 1.2 },
        C: { quad: 'Q1', jung: 'TJ', weight: 1.2 },
        D: { quad: 'Q4', jung: 'TP', weight: 1.2 },
        E: {},
      },
    },
    {
      id: 'q2',
      question_th: 'เวลาประชุม หัวหน้าของคุณมักเป็นแบบไหน?',
      choices: [
        { key: 'A', label_th: 'พูดน้อย ฟังมาก ถามคำถามเชิงลึก' },
        { key: 'B', label_th: 'พูดเยอะ ชอบ share vision และ inspire ทีม' },
        { key: 'C', label_th: 'สรุปเร็ว ตัดสินใจเร็ว ไม่ชอบนั่งนาน' },
        { key: 'D', label_th: 'ฟังทุกคนจนครบก่อนจึงสรุป' },
      ],
      maps_to: {
        A: { quad: 'Q2', jung: 'TP', weight: 1.0 },
        B: { quad: 'Q1', jung: 'FJ', weight: 1.0 },
        C: { quad: 'Q1', jung: 'TJ', weight: 1.0 },
        D: { quad: 'Q3', jung: 'FJ', weight: 1.0 },
        E: {},
      },
    },
    {
      id: 'q3',
      question_th: 'เมื่อคุณทำผิดพลาด หัวหน้าตอบสนองอย่างไร?',
      choices: [
        { key: 'A', label_th: 'บอกตรงๆ ว่าต้องแก้ไขอะไร มีกระบวนการ' },
        { key: 'B', label_th: 'ถามว่าเป็นยังไง มีอะไรช่วยได้ไหม' },
        { key: 'C', label_th: 'บอกตรงๆ แล้วก้าวหน้าต่อเลย ไม่引เรื่อง' },
        { key: 'D', label_th: 'เงียบแต่ดูเหมือนไม่พอใจ' },
      ],
      maps_to: {
        A: { jung: 'TJ', via: 'T', weight: 1.0 },
        B: { jung: 'FJ', via: 'H', weight: 1.0 },
        C: { jung: 'TP', via: 'C', weight: 1.0 },
        D: { via: 'J', weight: 0.8 },
        E: {},
      },
    },
    {
      id: 'q4',
      question_th: 'หัวหน้าให้ความสำคัญกับอะไรมากที่สุดในทีม?',
      choices: [
        { key: 'A', label_th: 'ผลลัพธ์ที่วัดได้ ตัวเลข เป้าหมาย' },
        { key: 'B', label_th: 'ความสัมพันธ์ในทีม ความสุขของทุกคน' },
        { key: 'C', label_th: 'กระบวนการที่ถูกต้อง ความเป็นระเบียบ' },
        { key: 'D', label_th: 'นวัตกรรม ความคิดใหม่ การทดลอง' },
      ],
      maps_to: {
        A: { via: 'J', jung: 'TJ', weight: 1.2 },
        B: { via: 'H', jung: 'FJ', weight: 1.2 },
        C: { via: 'T', jung: 'TJ', weight: 1.2 },
        D: { via: 'W', quad: 'Q1', weight: 1.2 },
        E: {},
      },
    },
    {
      id: 'q5',
      question_th: 'ถ้าเกิดความขัดแย้งในทีม หัวหน้ามักจัดการยังไง?',
      choices: [
        { key: 'A', label_th: 'เรียกคุยตรงๆ หาข้อเท็จจริงก่อน' },
        { key: 'B', label_th: 'ให้ทุกคนพูดและพยายาม mediate' },
        { key: 'C', label_th: 'ตัดสินใจเองว่าใครถูกแล้วสั่ง' },
        { key: 'D', label_th: 'หลีกเลี่ยงและรอให้เรื่องจบเอง' },
      ],
      maps_to: {
        A: { jung: 'TJ', via: 'J', weight: 1.0 },
        B: { jung: 'FJ', via: 'H', weight: 1.0 },
        C: { quad: 'Q1', jung: 'TJ', weight: 1.0 },
        D: { quad: 'Q2', weight: 0.8 },
        E: {},
      },
    },
  ],

  // ── เพื่อนร่วมงาน / เพื่อน ───────────────────────────────────
  colleague: [
    {
      id: 'q1',
      question_th: 'เมื่อมีงานกลุ่ม เพื่อนคนนี้มักทำอะไร?',
      choices: [
        { key: 'A', label_th: 'วิเคราะห์และวางแผนก่อนลงมือ' },
        { key: 'B', label_th: 'ประสานทีม ดูแลความสัมพันธ์' },
        { key: 'C', label_th: 'ลงมือทำก่อนเลยไม่รอแผน' },
        { key: 'D', label_th: 'ทำตามที่ได้รับมอบหมายอย่างละเอียด' },
      ],
      maps_to: {
        A: { quad: 'Q2', jung: 'TP', weight: 1.2 },
        B: { quad: 'Q3', jung: 'FJ', weight: 1.2 },
        C: { quad: 'Q1', jung: 'FP', weight: 1.2 },
        D: { quad: 'Q4', jung: 'TJ', weight: 1.2 },
        E: {},
      },
    },
    {
      id: 'q2',
      question_th: 'เวลาเครียดหรือกดดัน เพื่อนคนนี้มักทำอะไร?',
      choices: [
        { key: 'A', label_th: 'แยกตัวออกมาคิดคนเดียว' },
        { key: 'B', label_th: 'หาคนคุยระบาย' },
        { key: 'C', label_th: 'ลงมือทำอะไรบางอย่าง' },
        { key: 'D', label_th: 'ดูเหมือนเฉยๆ แต่ข้างในแบกอยู่' },
      ],
      maps_to: {
        A: { quad: 'Q2', jung: 'TP', weight: 1.0 },
        B: { quad: 'Q3', jung: 'FP', weight: 1.0 },
        C: { quad: 'Q1', weight: 1.0 },
        D: { quad: 'Q4', jung: 'TJ', weight: 1.0 },
        E: {},
      },
    },
    {
      id: 'q3',
      question_th: 'ถ้าต้องบอกว่าเพื่อนคนนี้ให้ความสำคัญกับอะไรมากที่สุด?',
      choices: [
        { key: 'A', label_th: 'ผลลัพธ์และความสำเร็จที่จับต้องได้' },
        { key: 'B', label_th: 'ความสัมพันธ์ที่ดีกับคนรอบข้าง' },
        { key: 'C', label_th: 'ความยุติธรรมและการทำสิ่งที่ถูกต้อง' },
        { key: 'D', label_th: 'ความอิสระและการค้นพบสิ่งใหม่' },
      ],
      maps_to: {
        A: { via: 'J', jung: 'TJ', weight: 1.2 },
        B: { via: 'H', jung: 'FJ', weight: 1.2 },
        C: { via: 'J', jung: 'FJ', weight: 1.2 },
        D: { via: 'W', quad: 'Q1', weight: 1.2 },
        E: {},
      },
    },
  ],

  // ── แฟน / คู่รัก ─────────────────────────────────────────────
  partner: [
    {
      id: 'q1',
      question_th: 'เวลาทะเลาะกัน เขา/เธอมักทำอะไร?',
      choices: [
        { key: 'A', label_th: 'พูดตรงๆ ว่ารู้สึกอะไร ต้องการอะไร' },
        { key: 'B', label_th: 'เงียบแต่ข้างในยังเจ็บ รอให้อีกฝ่ายมาหา' },
        { key: 'C', label_th: 'อธิบายด้วยเหตุผลว่าใครผิดถูก' },
        { key: 'D', label_th: 'พยายามประนีประนอม ไม่ให้ขัดแย้งนาน' },
      ],
      maps_to: {
        A: { jung: 'FJ', via: 'C', weight: 1.3 },
        B: { jung: 'FP', via: 'T', weight: 1.3 },
        C: { jung: 'TJ', via: 'J', weight: 1.3 },
        D: { jung: 'FJ', via: 'H', weight: 1.3 },
        E: {},
      },
    },
    {
      id: 'q2',
      question_th: 'เขา/เธอแสดงความรักแบบไหนมากที่สุด?',
      choices: [
        { key: 'A', label_th: 'ทำสิ่งต่างๆ ให้ (Acts of Service)' },
        { key: 'B', label_th: 'พูดบอกว่ารัก ชม (Words of Affirmation)' },
        { key: 'C', label_th: 'ใช้เวลาด้วยกัน (Quality Time)' },
        { key: 'D', label_th: 'สัมผัสทางกาย (Physical Touch)' },
        { key: 'E', label_th: 'ให้ของขวัญ (Gift Giving)' },
      ],
      maps_to: {
        A: { via: 'T', jung: 'TJ', weight: 1.0 },
        B: { via: 'H', jung: 'FJ', weight: 1.0 },
        C: { via: 'H', jung: 'FP', weight: 1.0 },
        D: { via: 'H', jung: 'FP', weight: 1.0 },
        E: { via: 'H', weight: 0.8 },
      },
    },
    {
      id: 'q3',
      question_th: 'เมื่อคุณเผชิญปัญหา เขา/เธอมักทำอะไร?',
      choices: [
        { key: 'A', label_th: 'แนะนำวิธีแก้ปัญหาทันที' },
        { key: 'B', label_th: 'รับฟังและอยู่เคียงข้าง' },
        { key: 'C', label_th: 'ลงมือช่วยแก้ให้เลย' },
        { key: 'D', label_th: 'ให้กำลังใจด้วยคำพูด' },
      ],
      maps_to: {
        A: { jung: 'TJ', quad: 'Q2', weight: 1.2 },
        B: { jung: 'FJ', via: 'H', weight: 1.2 },
        C: { jung: 'TJ', quad: 'Q4', weight: 1.2 },
        D: { jung: 'FP', via: 'H', weight: 1.2 },
        E: {},
      },
    },
  ],

  // ── เพื่อนในกลุ่ม (NAVA/VERA) ───────────────────────────────
  classmate: [
    {
      id: 'q1',
      question_th: 'ในกลุ่มเพื่อน เขา/เธอมักเป็นใคร?',
      choices: [
        { key: 'A', label_th: 'คนที่คิดเยอะ มีไอเดีย แต่อาจเงียบ' },
        { key: 'B', label_th: 'คนที่ทุกคนรัก ช่วยให้กลุ่มสนุก' },
        { key: 'C', label_th: 'คนที่เริ่มทำก่อน ชวนคนอื่นตาม' },
        { key: 'D', label_th: 'คนที่ทำสิ่งที่รับปากครบเสมอ' },
      ],
      maps_to: {
        A: { quad: 'Q2', jung: 'TP', weight: 1.2 },
        B: { quad: 'Q3', jung: 'FP', weight: 1.2 },
        C: { quad: 'Q1', jung: 'FJ', weight: 1.2 },
        D: { quad: 'Q4', jung: 'TJ', weight: 1.2 },
        E: {},
      },
    },
    {
      id: 'q2',
      question_th: 'เวลาโดนบูลลี่หรือเจอเรื่องยาก เขา/เธอมักทำอะไร?',
      choices: [
        { key: 'A', label_th: 'เก็บไว้คนเดียว ไม่บอกใคร' },
        { key: 'B', label_th: 'ระบายกับเพื่อนที่ไว้ใจ' },
        { key: 'C', label_th: 'สู้กลับหรือพูดตรงๆ' },
        { key: 'D', label_th: 'ดูเหมือนไม่เป็นไร แต่จริงๆ เจ็บ' },
      ],
      maps_to: {
        A: { via: 'T', jung: 'TJ', weight: 1.0 },
        B: { via: 'H', jung: 'FP', weight: 1.0 },
        C: { via: 'C', quad: 'Q1', weight: 1.0 },
        D: { jung: 'FJ', weight: 1.0 },
        E: {},
      },
    },
    {
      id: 'q3',
      question_th: 'ถ้าต้องบอกว่าเขา/เธอสำคัญกับอะไรมากที่สุด?',
      choices: [
        { key: 'A', label_th: 'การเรียนดี ผลลัพธ์ที่ดี' },
        { key: 'B', label_th: 'มีเพื่อนที่ดี รู้สึกเป็นที่รัก' },
        { key: 'C', label_th: 'ทำสิ่งที่ถูกต้อง ไม่ยอมในสิ่งผิด' },
        { key: 'D', label_th: 'อิสระ ได้ทำสิ่งที่ตัวเองชอบ' },
      ],
      maps_to: {
        A: { via: 'J', jung: 'TJ', weight: 1.2 },
        B: { via: 'H', jung: 'FJ', weight: 1.2 },
        C: { via: 'J', weight: 1.2 },
        D: { via: 'W', quad: 'Q1', weight: 1.2 },
        E: {},
      },
    },
  ],
};

// ── Estimation Algorithm ─────────────────────────────────────────

function estimateTargetProfile(answers: QAAnswers, role: TargetRole): {
  quad: string; jung: string; via: string; confidence: 'low' | 'medium' | 'high';
} {
  const questions = QUESTIONS_BY_ROLE[role] || QUESTIONS_BY_ROLE.colleague;

  // Accumulators
  const quadVotes: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  const jungVotes: Record<string, number> = { TJ: 0, TP: 0, FJ: 0, FP: 0 };
  const viaVotes: Record<string, number> = { W: 0, C: 0, H: 0, J: 0, T: 0, Tr: 0 };
  let totalWeight = 0;
  let answeredCount = 0;

  for (const q of questions) {
    const answer = (answers as any)[q.id] as 'A' | 'B' | 'C' | 'D' | 'E' | undefined;
    if (!answer) continue;
    const map = q.maps_to[answer];
    if (!map) continue;

    const w = map.weight ?? 1.0;
    if (map.quad) quadVotes[map.quad] = (quadVotes[map.quad] || 0) + w;
    if (map.jung) jungVotes[map.jung] = (jungVotes[map.jung] || 0) + w;
    if (map.via)  viaVotes[map.via]   = (viaVotes[map.via]   || 0) + w;
    totalWeight += w;
    answeredCount++;
  }

  // Pick winners
  const quad = Object.entries(quadVotes).reduce((a, b) => a[1] >= b[1] ? a : b)[0];
  const jung = Object.entries(jungVotes).reduce((a, b) => a[1] >= b[1] ? a : b)[0];
  const via  = Object.entries(viaVotes).reduce((a, b)  => a[1] >= b[1] ? a : b)[0];

  // Confidence: ยิ่งตอบมาก และ vote กระจุกตัวมาก ยิ่ง confident
  const topQuadScore = Math.max(...Object.values(quadVotes));
  const confidence: 'low' | 'medium' | 'high' =
    answeredCount >= 4 && topQuadScore / totalWeight >= 0.5 ? 'high' :
    answeredCount >= 3 ? 'medium' : 'low';

  return { quad, jung, via, confidence };
}

// ── Compat Calculator ────────────────────────────────────────────

const VIA_C: Record<string, number> = {
  'W-W':0.7,'W-C':0.7,'W-H':0.7,'W-J':0.6,'W-T':0.5,'W-Tr':0.8,
  'C-C':0.7,'C-H':0.6,'C-J':0.9,'C-T':0.5,'C-Tr':0.7,
  'H-H':0.9,'H-J':0.8,'H-T':0.7,'H-Tr':0.9,
  'J-J':0.6,'J-T':0.7,'J-Tr':0.6,'T-T':0.7,'T-Tr':0.8,'Tr-Tr':0.8,
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

export function calcTargetCompat(
  userArchId: string,
  targetQuad: string,
  targetJung: string,
  targetVia: string
): number {
  const m = userArchId.match(/Y_(\w+)-(\w+)-(\w+)/);
  if (!m) return 50;
  const [, userVia, userQuad, userJung] = m;

  const raw =
    gc(VIA_C, userVia, targetVia) * 0.40 +
    gc(QD_C, userQuad, targetQuad) * 0.25 +
    gc(JG_C, userJung, targetJung) * 0.15 +
    0.5 * 0.20; // OCEAN placeholder (ไม่มีข้อมูล target)

  const stretched = ((raw - 0.35) / (0.85 - 0.35)) * 100;
  return Math.round(Math.max(20, Math.min(95, stretched)));
}

// ── Social Guide Generator ───────────────────────────────────────

const QUAD_GUIDE: Record<string, Record<string, string>> = {
  Q1: {
    Q1: 'คุณสองคนพลังงานสูงพอๆ กัน ต้องมีคนยอมเป็นผู้ฟังบ้าง ไม่งั้นทุกคนพูดพร้อมกัน',
    Q2: 'เขาต้องการเวลาคิดก่อนตอบ — รอ 24 ชั่วโมงหลังถามคำถามสำคัญ อย่าเร่ง',
    Q3: 'คู่ที่ลงตัวมาก คุณ inspire เขา connect คนรอบข้างให้คุณ',
    Q4: 'คู่ที่เสริมกันสูงที่สุด คุณสร้าง vision เขาทำให้มันเกิดขึ้นจริง',
  },
  Q2: {
    Q1: 'เขาต้องการ action เร็ว คุณต้องการ analysis — ตกลงกันว่ามี "เวลาคิด" กี่ชั่วโมงก่อน decide',
    Q2: 'ระวัง Analysis Paralysis สองคน ต้องมี deadline ที่ชัดเจน',
    Q3: 'เขาช่วยให้คุณออกมาจากโลกความคิด คุณช่วยให้เขามีทิศทาง',
    Q4: 'ทั้งคู่ชอบทำคนเดียว ต้องนัด sync meeting เป็นประจำ ไม่งั้น drift ห่างกัน',
  },
  Q3: {
    Q1: 'คุณช่วย manage ความสัมพันธ์ในทีมให้เขา เขา push คุณออกจาก comfort zone',
    Q2: 'เขาต้องการ space คุณต้องการ connection — ตกลงว่าจะคุยกันกี่ครั้งต่อสัปดาห์',
    Q3: 'เข้ากันดีด้านความสัมพันธ์ แต่อาจขาด direction ต้องมีคนเป็น "ผู้นำทิศทาง"',
    Q4: 'คุณ social เขา systematic คุณ connect เขา execute ผลดี',
  },
  Q4: {
    Q1: 'เขา disrupt คุณ build ให้เขา "เสี่ยง" ในกรอบที่คุณวางไว้ แทนที่จะห้ามเลย',
    Q2: 'ทั้งคู่ชอบทำงานคนเดียว ต้องนัดเช็กอินสม่ำเสมอและมี shared goal ที่ชัด',
    Q3: 'เขาดูแลความสัมพันธ์ คุณดูแลคุณภาพงาน แบ่งงานตามจุดแข็งได้เลย',
    Q4: 'ทำงานด้วยกันได้ดี แต่ต้องระวังไม่มีใครยืดหยุ่นเมื่อแผนพัง',
  },
};

const JUNG_GUIDE: Record<string, Record<string, string>> = {
  TJ: {
    TJ: 'คุณสองคนตรงไปตรงมาเหมือนกัน — ระวัง "ชนกัน" เรื่องวิธีทำงาน ให้ต่างคนมีพื้นที่',
    TP: 'คุณวางแผน เขา flexible — กำหนดว่าใครตัดสินใจเรื่องอะไร',
    FJ: 'คุณเน้นเหตุผล เขาเน้นความสัมพันธ์ — ฟังความรู้สึกเขาก่อน แล้วค่อย logic',
    FP: 'สไตล์ต่างกันมาก คุณต้องการโครงสร้าง เขาต้องการอิสระ — แบ่งส่วนที่ตกลงร่วมและส่วนที่ต่างคนทำ',
  },
  FJ: {
    TJ: 'เขาอาจดูเย็นชา คุณอาจดู sensitive เกิน — จริงๆ ทั้งคู่ใส่ใจ แค่แสดงออกต่างกัน',
    TP: 'คุณชอบ closure เขาชอบ options เปิด — ตกลงว่า deadline ต้องชัดแค่ไหน',
    FJ: 'เข้าใจกันง่ายมาก แต่ระวัง echo chamber — ต้องการคนที่คิดต่างมา challenge',
    FP: 'ทั้งคู่เน้นคน คุณช่วยให้มีโครงสร้าง เขาช่วยให้ยืดหยุ่น',
  },
  TP: {
    TJ: 'เขาต้องการ plan ชัด คุณชอบ improvise — มี "core plan" ที่เปลี่ยนไม่ได้ และส่วน flexible',
    TP: 'สนุก creative ด้วยกัน แต่ไม่มีใคร follow through — ต้องมีคนรับผิดชอบ execution',
    FJ: 'คุณ logic เขา feeling — ฟังดูต่างกัน แต่เสริมกันดีถ้า trust กัน',
    FP: 'ทั้งคู่ชอบอิสระ ระวังขาดความรับผิดชอบร่วมกัน',
  },
  FP: {
    TJ: 'สไตล์ต่างกันสุด แต่เสริมกันได้ดีมากถ้า respect กัน คุณ inspire เขา execute',
    TP: 'ทั้งคู่ flexible creative — ต้องมีคน anchor ที่เป็น responsible party',
    FJ: 'ทั้งคู่ใส่ใจคน คุณ creative เขา organized ทำงานด้วยกันได้ดี',
    FP: 'เข้าใจกันดีมาก แต่ต้องมี structure จากภายนอก',
  },
};

export function generateSocialGuide(
  userQuad: string, userJung: string,
  targetQuad: string, targetJung: string,
  compatScore: number
): {
  level: string; summary: string;
  quad_tip: string; jung_tip: string;
  mindset_tips: string[]; action_items: string[];
} {
  const level =
    compatScore >= 70 ? 'สูง' :
    compatScore >= 50 ? 'ปานกลาง' : 'ท้าทาย';

  const levelDesc =
    level === 'สูง' ? 'มีพื้นฐานที่ดี ต่อยอดได้ง่าย' :
    level === 'ปานกลาง' ? 'ต้องลงทุนความเข้าใจกัน แต่คุ้มค่า' :
    'ต้องการความพยายามมากกว่าปกติ แต่ความแตกต่างคือโอกาสเรียนรู้';

  const quad_tip = QUAD_GUIDE[userQuad]?.[targetQuad] ?? '';
  const jung_tip = JUNG_GUIDE[userJung]?.[targetJung] ?? '';

  const mindset_tips: string[] = [
    'เหมือน ≠ เข้ากันได้ — บางทีคนที่เสริมกันได้ดีที่สุดคือคนที่ต่างในสิ่งที่ขาด',
    'ต่าง ≠ เข้ากันยาก — ความต่างที่เสริมกันคือ strength ที่ทรงพลังที่สุด',
    'ปรับ ≠ ยอม — การปรับตัวที่ยั่งยืนมาจากความเข้าใจ ไม่ใช่การสูญเสียตัวตน',
  ];

  const action_items: string[] = [quad_tip, jung_tip].filter(Boolean);
  if (compatScore < 50) {
    action_items.push('นัดคุยตรงๆ เรื่องวิธีทำงานที่แต่ละคนถนัด ก่อนเริ่มโปรเจคร่วมกัน');
  }
  if (compatScore >= 70) {
    action_items.push('ใช้จุดแข็งร่วมกันโดยแบ่งงานตาม Quad — อย่า duplicate effort');
  }

  return {
    level,
    summary: `ความเข้ากันได้ระดับ${level} (${compatScore}%) — ${levelDesc}`,
    quad_tip,
    jung_tip,
    mindset_tips,
    action_items,
  };
}

// ── Save to Database ─────────────────────────────────────────────

export async function saveQuickAssessment(params: {
  userId: string;
  platform: string;
  targetRole: TargetRole;
  targetDesc?: string;
  answers: QAAnswers;
  userArchetypeId: string;
  situationType?: string;
}): Promise<{ qaId: string; result: QAResult; guide: ReturnType<typeof generateSocialGuide> }> {

  const { userId, platform, targetRole, targetDesc, answers, userArchetypeId, situationType } = params;

  // 1. Estimate target profile
  const profile = estimateTargetProfile(answers, targetRole);

  // 2. Calculate compat
  const calc_compat = calcTargetCompat(
    userArchetypeId, profile.quad, profile.jung, profile.via
  );

  // 3. Generate social guide
  const m = userArchetypeId.match(/Y_(\w+)-(\w+)-(\w+)/);
  const userQuad = m?.[2] ?? 'Q2';
  const userJung = m?.[3] ?? 'TP';
  const guide = generateSocialGuide(userQuad, userJung, profile.quad, profile.jung, calc_compat);

  // 4. Save to DB
  const { data, error } = await supabase
    .from('quick_assessments')
    .insert({
      user_id: userId,
      platform,
      target_role: targetRole,
      target_desc: targetDesc,
      q1_answer: answers.q1,
      q2_answer: answers.q2,
      q3_answer: answers.q3,
      q4_answer: answers.q4,
      q5_answer: answers.q5,
      estimated_quad: profile.quad,
      estimated_jung: profile.jung,
      estimated_via: profile.via,
      calc_compat: calc_compat / 100,
      situation_type: situationType,
    })
    .select('id')
    .single();

  if (error) throw error;

  const result: QAResult = {
    estimated_quad: profile.quad,
    estimated_jung: profile.jung,
    estimated_via: profile.via,
    confidence: profile.confidence,
    calc_compat,
    description_th: guide.summary,
  };

  return { qaId: data.id, result, guide };
}
