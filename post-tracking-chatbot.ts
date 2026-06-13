// ═══════════════════════════════════════════════════════════════════
// KRUTH DEMM — Post-Advice Tracking Chatbot Flow
// lib/post-tracking-chatbot.ts
// ติดตามผลหลังให้คำแนะนำ Day 3/7/14/30
// + Validate สมการ Compat กับความเป็นจริง
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// ── Types ────────────────────────────────────────────────────────

type CheckDay = 3 | 7 | 14 | 30;

type CheckinContext = {
  userId: string;
  platform: string;
  qaId: string;
  targetRole: string;
  theoryUsed: string;
  calcCompat: number;
  checkDay: CheckDay;
  userArchetypeId: string;
  prevOutcome?: { score: number; what_worked?: string };
};

type CheckinResponse = {
  tried: boolean;
  outcome_score?: number;
  relationship_delta?: number;
  what_worked?: string;
  what_failed?: string;
  barrier?: string;
  user_changed?: boolean;
  theory_effective?: boolean;
  next_theory?: string;
};

type ValidateResponse = {
  pair_type: 'best_match' | 'worst_match' | 'counter_example' | 'neutral';
  target_desc: string;
  estimated_quad?: string;
  estimated_jung?: string;
  actual_compat: number;
  mindset_type: string;
  notes?: string;
};

// ── Check-in Message Builders ────────────────────────────────────

export function buildCheckinMessage(ctx: CheckinContext): string {
  const { targetRole, theoryUsed, checkDay, prevOutcome } = ctx;

  const roleLabel: Record<string, string> = {
    boss: 'หัวหน้า', colleague: 'เพื่อนร่วมงาน',
    friend: 'เพื่อน', partner: 'แฟน/คู่รัก',
    classmate: 'เพื่อนในกลุ่ม', teacher: 'อาจารย์',
  };
  const role = roleLabel[targetRole] || targetRole;

  if (checkDay === 3) {
    return `สวัสดีนะคะ 👋 ครบ 3 วันแล้ว ลองทำตามที่คุยกันเรื่อง${role}ไหมคะ?\n\n` +
      `[✅ ลองแล้ว] [⏳ ยังไม่ได้ลอง] [❌ ไม่รู้จะเริ่มยังไง]`;
  }

  if (checkDay === 7) {
    const prev = prevOutcome ? `ครั้งที่แล้วคุณบอกว่า "${prevOutcome.what_worked || 'พอมีประโยชน์'}" ` : '';
    return `สัปดาห์ผ่านไปแล้ว 🌱 ${prev}\n` +
      `ตอนนี้ความสัมพันธ์กับ${role}เป็นยังไงบ้างคะ?\n\n` +
      `[😊 ดีขึ้นชัดเจน] [🔄 ค่อยๆ ดีขึ้น] [😐 เหมือนเดิม] [😔 ยังท้าทายอยู่]`;
  }

  if (checkDay === 14) {
    return `ครึ่งทางแล้วนะคะ 💫 อยากถาม 3 ข้อสั้นๆ เกี่ยวกับ${role}\n\n` +
      `ข้อ 1: ความสัมพันธ์เทียบกับ 2 สัปดาห์ที่แล้ว?\n` +
      `[+2 ดีขึ้นมาก] [+1 ดีขึ้นบ้าง] [0 เหมือนเดิม] [-1 ยากขึ้น] [-2 แย่ลง]`;
  }

  if (checkDay === 30) {
    return `ครบเดือนแล้วค่ะ 🎯 อยากทบทวนสิ่งที่เรียนรู้จากความสัมพันธ์กับ${role}ด้วยกันนะคะ\n\n` +
      `โดยรวม สิ่งที่ลองทำมา 30 วัน ให้คะแนนผลลัพธ์ 1-5 ได้เลยค่ะ\n` +
      `[⭐1] [⭐⭐2] [⭐⭐⭐3] [⭐⭐⭐⭐4] [⭐⭐⭐⭐⭐5]`;
  }

  return '';
}

// ── Validate Message Builder ─────────────────────────────────────

export function buildValidateMessage(stage: 1 | 2 | 3 | 4 | 5): string {
  const messages: Record<number, string> = {
    1: `อยากทดสอบบางอย่างกับคุณได้ไหมคะ? 🔬\n` +
       `ผมมีคำถามเกี่ยวกับความสัมพันธ์รอบข้าง เพื่อช่วยให้ระบบเรียนรู้ได้แม่นยำขึ้น\n\n` +
       `ในกลุ่มเพื่อน/ทีม **ใครที่คุณเข้ากันได้ดีที่สุด?**\n` +
       `ไม่ต้องบอกชื่อ แค่บอกลักษณะว่าเขาเป็นคนแบบไหน\n\n` +
       `[บอกเลย] [ข้ามได้ไหม]`,

    2: `ขอบคุณนะคะ 😊 แล้ว **ใครที่เข้ากันยากที่สุด?**\n` +
       `บอกลักษณะของเขาได้เลยค่ะ ไม่ต้องบอกชื่อ`,

    3: `มีไหมคะ **คนที่เหมือนคุณมากๆ แต่กลับเข้ากันยาก**\n` +
       `หรือ **คนที่ต่างกันมากแต่เข้ากันได้ดีมาก**?\n\n` +
       `[มี ขอเล่าให้ฟัง] [ไม่มีเลย] [ไม่แน่ใจ]`,

    4: `จากประสบการณ์ทั้งหมด คุณคิดว่าอะไรสำคัญกว่าสำหรับการเข้ากันได้ดี?\n\n` +
       `[🤝 ค่านิยมที่ใกล้กัน] [🔄 สไตล์ที่เสริมกัน]\n` +
       `[💙 ความไว้ใจกัน] [🎯 เป้าหมายที่ตรงกัน]`,

    5: `คำถามสุดท้ายนะคะ 🌱\n` +
       `การ "ปรับตัว" เข้าหากัน สำหรับคุณหมายความว่าอะไรมากกว่า?\n\n` +
       `[🔄 เปลี่ยนตัวเองบางส่วน] [🧠 เข้าใจอีกฝ่ายมากขึ้น]\n` +
       `[⚖️ ทั้งสองฝ่ายพบกันครึ่งทาง] [🚶 ยอมรับว่าบางคนเข้ากันไม่ได้]`,
  };

  return messages[stage] || '';
}

// ── Mindset Insight Generator ────────────────────────────────────

export function buildMindsetMessage(
  userQuad: string,
  targetQuad: string,
  calcCompat: number,
  userFeltCompat: number
): string {
  const delta = userFeltCompat - calcCompat / 100;
  const isSameQuad = userQuad === targetQuad;

  let insight = '';

  if (isSameQuad && userFeltCompat < 0.5) {
    insight = `🔍 น่าสนใจมาก! คุณและเขามี Quadrant เดียวกัน (${userQuad})\n` +
      `แต่ความรู้สึกบอกว่าเข้ากันได้ไม่ดีนัก\n\n` +
      `นั่นยืนยันหลักการที่ว่า **เหมือน ≠ เข้ากันได้เสมอ**\n` +
      `คนที่เหมือนกันมากอาจ "ชนกัน" เรื่องวิธีทำสิ่งเดียวกัน\n` +
      `ลองดูว่าความขัดแย้งมักมาจากเรื่องอะไรบ้าง?`;
  } else if (!isSameQuad && userFeltCompat >= 0.7) {
    insight = `✨ ยอดเยี่ยมมาก! คุณและเขา Quadrant ต่างกัน (${userQuad} vs ${targetQuad})\n` +
      `แต่ความรู้สึกบอกว่าเข้ากันได้ดีมาก\n\n` +
      `นั่นคือ **ความต่างที่เสริมกัน** — สิ่งที่ทรงพลังที่สุดในความสัมพันธ์\n` +
      `คุณสองคนน่าจะมี Values ที่คล้ายกัน แม้วิธีทำจะต่างกัน`;
  } else if (delta > 0.15) {
    insight = `📊 ระบบประเมินว่าเข้ากันได้ ${calcCompat}%\n` +
      `แต่คุณรู้สึกว่าเข้ากันได้มากกว่านั้น\n\n` +
      `อาจมีปัจจัยที่ระบบยังไม่รู้ เช่น ประสบการณ์ร่วมกัน ความไว้วางใจ\n` +
      `หรือ Values ที่ตรงกันซึ่งไม่ได้วัดจาก Archetype อย่างเดียว`;
  } else if (delta < -0.15) {
    insight = `📊 ระบบประเมินว่าเข้ากันได้ ${calcCompat}%\n` +
      `แต่คุณรู้สึกว่าท้าทายกว่านั้น\n\n` +
      `อาจมีเรื่องราวหรือประสบการณ์ที่ทำให้รู้สึกแบบนั้น\n` +
      `อยากเล่าให้ฟังได้เลยค่ะ ระบบจะได้เรียนรู้จากความเป็นจริงมากขึ้น`;
  } else {
    insight = `✅ ความรู้สึกของคุณสอดคล้องกับที่ระบบประเมินไว้ดีมากค่ะ\n` +
      `นั่นช่วยยืนยันว่าสมการที่ใช้มีความแม่นยำในระดับที่ดี`;
  }

  return insight;
}

// ── Process Checkin Response ─────────────────────────────────────

export async function processCheckinResponse(
  ctx: CheckinContext,
  userMessage: string,
  chatHistory: { role: 'user' | 'assistant'; content: string }[]
): Promise<{ botReply: string; extracted: Partial<CheckinResponse> }> {

  const systemPrompt = `คุณคือ KRUTH AI Wellbeing Coach
ทำหน้าที่ติดตามผลหลังให้คำแนะนำ Day ${ctx.checkDay}

ข้อมูลบริบท:
- ผู้ใช้ต้องการปรับตัวกับ: ${ctx.targetRole}
- ทฤษฎีที่แนะนำ: ${ctx.theoryUsed}
- ความเข้ากันได้ที่ประเมินไว้: ${ctx.calcCompat}%

กฎการสนทนา:
1. ฟังและ validate ก่อนเสมอ — ไม่ตัดสิน
2. ถ้า "ลองแล้วได้ผล" → ชื่นชม ถามว่าอะไรได้ผลโดยเฉพาะ
3. ถ้า "ลองแล้วไม่ได้ผล" → validate + ถามว่าติดขัดตรงไหน + เสนอ theory ใหม่
4. ถ้า "ยังไม่ได้ลอง" → ถาม barrier + ลด scope ให้เล็กลง
5. ห้ามใช้คำ: โรค ผิดปกติ วินิจฉัย
6. ถ้าเห็น Rain/Crisis signal → แนะนำ 1323 ทันที
7. ตอบเป็นภาษาไทย อบอุ่น ไม่เป็นทางการเกิน

หลังสนทนา ให้สรุปใน JSON format ท้ายสุด:
{
  "tried": boolean,
  "outcome_score": 1-5 หรือ null,
  "relationship_delta": -2 ถึง +2 หรือ null,
  "what_worked": "string หรือ null",
  "what_failed": "string หรือ null",
  "barrier": "string หรือ null",
  "theory_effective": boolean หรือ null,
  "next_theory": "theory_id หรือ null"
}`;

  const messages = [
    ...chatHistory,
    { role: 'user' as const, content: userMessage },
  ];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: systemPrompt,
    messages,
  });

  const botReply = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('');

  // Extract JSON from response
  let extracted: Partial<CheckinResponse> = {};
  try {
    const jsonMatch = botReply.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      extracted = JSON.parse(jsonMatch[0]);
    }
  } catch { /* silent */ }

  // Clean reply (remove JSON block for user display)
  const cleanReply = botReply.replace(/\{[\s\S]*\}/, '').trim();

  return { botReply: cleanReply, extracted };
}

// ── Save Checkin Outcome ─────────────────────────────────────────

export async function saveCheckinOutcome(
  ctx: CheckinContext,
  response: CheckinResponse
): Promise<void> {
  await supabase.from('advice_outcomes').insert({
    user_id: ctx.userId,
    platform: ctx.platform,
    quick_assessment_id: ctx.qaId,
    theory_used: ctx.theoryUsed,
    check_day: ctx.checkDay,
    tried: response.tried,
    outcome_score: response.outcome_score,
    relationship_delta: response.relationship_delta,
    what_worked: response.what_worked,
    what_failed: response.what_failed,
    barrier_to_try: response.barrier,
    user_changed: response.user_changed,
    theory_effective: response.theory_effective,
    next_theory: response.next_theory,
  });

  // ถ้า theory ไม่ได้ผลติดกัน 2 ครั้ง → แนะนำ theory ใหม่
  if (response.theory_effective === false && ctx.checkDay >= 7) {
    await suggestAlternativeTheory(ctx, response);
  }

  // อัปเดต checkin_schedule
  await supabase
    .from('checkin_schedule')
    .update({ completed_at: new Date().toISOString(), status: 'completed' })
    .eq('user_id', ctx.userId)
    .eq('scheduled_day', ctx.checkDay)
    .eq('status', 'sent');
}

// ── Schedule Next Check-in ───────────────────────────────────────

export async function scheduleCheckins(
  userId: string,
  platform: string,
  triggerId: string
): Promise<void> {
  const now = new Date();
  const schedule = [3, 7, 14, 30] as CheckDay[];

  const rows = schedule.map(day => ({
    user_id: userId,
    platform,
    advice_outcome_trigger_id: triggerId,
    scheduled_day: day,
    scheduled_at: new Date(now.getTime() + day * 24 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
  }));

  await supabase.from('checkin_schedule').insert(rows);
}

// ── Suggest Alternative Theory ───────────────────────────────────

async function suggestAlternativeTheory(
  ctx: CheckinContext,
  response: CheckinResponse
): Promise<string | null> {
  const THEORY_ALTERNATIVES: Record<string, string[]> = {
    'TA_001': ['EI_001', 'PT_001'],
    'GT_001': ['EI_001', 'CR_001'],
    'EI_001': ['CB_001', 'AC_001'],
    'CB_001': ['AC_001', 'PT_001'],
    'AC_001': ['SD_001', 'GM_001'],
    'AT_001': ['CB_001', 'EI_001'],
    'PT_001': ['TA_001', 'GT_001'],
    'CR_001': ['GT_001', 'AI_001'],
    'HL_001': ['SD_001', 'GM_001'],
    'GM_001': ['CB_001', 'AC_001'],
    'SD_001': ['AC_001', 'HL_001'],
    'PS_001': ['AI_001', 'MI_001'],
    'MI_001': ['TA_001', 'EI_001'],
    'AI_001': ['PS_001', 'EI_001'],
    'SE_001': ['TA_001', 'CR_001'],
  };

  const alternatives = THEORY_ALTERNATIVES[ctx.theoryUsed] || [];
  const next = response.next_theory || alternatives[0] || null;

  if (next) {
    await supabase.from('validation_insights').insert({
      insight_type: 'theory_switch',
      affected_pairs: [ctx.userArchetypeId],
      recommendation: `${ctx.theoryUsed} ไม่ได้ผลสำหรับ ${ctx.targetRole} — ลอง ${next}`,
      status: 'pending',
    });
  }

  return next;
}

// ── Validate Compat ──────────────────────────────────────────────

export async function saveCompatValidation(
  userId: string,
  platform: string,
  userArchId: string,
  validate: ValidateResponse
): Promise<void> {
  const m = userArchId.match(/Y_(\w+)-(\w+)-(\w+)/);
  if (!m) return;
  const [, userVia, userQuad, userJung] = m;

  // คำนวณ calc compat กับ estimate
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
  const gc = (map: Record<string, number>, a: string, b: string) =>
    map[`${a}-${b}`] ?? map[`${b}-${a}`] ?? 0.5;

  const tq = validate.estimated_quad ?? 'Q2';
  const tj = validate.estimated_jung ?? 'TP';

  const raw =
    gc(VIA_C, userVia, 'H') * 0.40 + // via ไม่รู้ ใช้ baseline
    gc(QD_C, userQuad, tq) * 0.25 +
    gc(JG_C, userJung, tj) * 0.15 +
    0.5 * 0.20;

  const stretched = ((raw - 0.35) / 0.5) * 100;
  const calc_compat = Math.max(20, Math.min(95, stretched)) / 100;

  await supabase.from('compat_validations').insert({
    user_id: userId,
    platform,
    pair_type: validate.pair_type,
    user_quad: userQuad,
    target_quad: tq,
    user_jung: userJung,
    target_jung: tj,
    user_via: userVia,
    calc_compat,
    actual_compat: validate.actual_compat,
    is_same_quad: userQuad === tq,
    is_same_jung: userJung === tj,
    mindset_type: validate.mindset_type,
    notes: validate.notes,
  });

  // ถ้า delta ใหญ่ → log insight
  const delta = Math.abs(validate.actual_compat - calc_compat);
  if (delta > 0.2) {
    await supabase.from('validation_insights').insert({
      insight_type: 'compat_bias',
      affected_pairs: [`${userQuad}-${tq}`, `${userJung}-${tj}`],
      layer: userQuad === tq ? 'quad_same' : 'quad_diff',
      calc_avg: calc_compat,
      actual_avg: validate.actual_compat,
      bias_direction: validate.actual_compat > calc_compat
        ? 'under_estimate' : 'over_estimate',
      sample_count: 1,
      recommendation: delta > 0.2
        ? `ต้องตรวจสอบ ${userQuad}-${tq}: สมการ ${calc_compat.toFixed(2)} จริง ${validate.actual_compat.toFixed(2)}`
        : 'ใกล้เคียงพอ',
      status: 'pending',
    });
  }
}

// ── Process Pending Check-ins (Vercel Cron) ──────────────────────
// เรียกจาก: app/api/cron/checkin/route.ts ทุก 6 ชั่วโมง

export async function processPendingCheckins(): Promise<{ sent: number }> {
  const now = new Date();

  const { data: pending } = await supabase
    .from('checkin_schedule')
    .select('*, users(line_user_id, platform)')
    .eq('status', 'pending')
    .lte('scheduled_at', now.toISOString())
    .limit(50);

  if (!pending?.length) return { sent: 0 };

  let sent = 0;
  for (const schedule of pending) {
    try {
      // TODO: ส่งผ่าน Line Messaging API
      // const message = buildCheckinMessage({ checkDay: schedule.scheduled_day, ... })
      // await lineClient.pushMessage(schedule.users.line_user_id, { type: 'text', text: message })

      await supabase
        .from('checkin_schedule')
        .update({ sent_at: now.toISOString(), status: 'sent' })
        .eq('id', schedule.id);

      sent++;
    } catch (e) {
      console.error(`Failed to send checkin ${schedule.id}:`, e);
    }
  }

  return { sent };
}
