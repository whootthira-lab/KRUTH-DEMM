import { supabase } from './supabase';
import Anthropic from '@anthropic-ai/sdk';
import kbRaw from './satiya_kb.json';
const kb = kbRaw as any;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Types
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatState {
  isToxicMode: boolean;
  currentAqIndex: number;
  aqAnswers: Record<string, string>; // e.g., { AQ1: 'A', AQ2: 'B' }
}

export interface UserProfile {
  id: string;
  name: string;
  archetype_id: string;
  quadrant: string;
  jungian: string;
  via_dominant: string;
  vitality: number;
  meaning: number;
  connection: number;
  mastery: number;
  resilience: number;
  kwi_total: number;
  wellbeing_pattern: string;
}

/**
 * Helper: Detect if a user message contains toxic workplace triggers
 */
function detectToxicKeywords(message: string): boolean {
  const triggers: string[] = kb.toxic_rules_json.assessment_flow?.trigger_keywords || [
    "เฮงซวย", "toxic", "หัวหน้าแย่", "เพื่อนร่วมงานแย่", "โดนกลั่นแกล้ง",
    "โยนความผิด", "claim งาน", "ถูกดุ", "ทนไม่ไหว", "อยากออก", "บรรยากาศแย่",
    "ประชุมไม่มีเหตุผล", "micromanage", "ไม่ยุติธรรม", "ถูกกีดกัน"
  ];
  const msg = message.toLowerCase();
  return triggers.some(t => msg.includes(t.toLowerCase()));
}

/**
 * Helper: Map AQ options
 */
export function getAqQuestion(index: number) {
  const questions = kb.toxic_questions || [];
  return questions[index] || null;
}

/**
 * Helper: Classify Toxic Type based on answers
 */
function classifyToxicType(answers: Record<string, string>, profile: UserProfile | null) {
  // AQ1 choices: A=แทบทุกวัน, B=สัปดาห์ละ 1-2 ครั้ง, C=เดือนละ 2-3 ครั้ง, D=นานๆ ครั้ง
  // AQ2 choices: A=หัวหน้างานโดยตรง, B=เพื่อนร่วมงานในทีมเดียวกัน, C=ผู้บริหารระดับสูง, D=ลูกค้า
  // AQ3 choices: A=พุ่งเป้ามาที่ฉันคนเดียวโดยเฉพาะ, B=เกิดขึ้นกับเพื่อนร่วมงานหลายๆ คนเช่นกัน, C=เกิดขึ้นกับทุกคนที่ขัดแย้งกับเขา, D=ไม่แน่ใจ
  // AQ4 choices: A=สมาธิสั้นลง นอนไม่หลับ รู้สึกหวาดระแวงตลอดเวลา, B=อยากย้ายงานหรือลาออกในทันที, C=ส่งผลเสียบางส่วน, D=ไม่มีผลกระทบ
  // AQ5 choices: A=หาวิธีรับมือเอาตัวรอดรายวัน, B=วางแผนเปลี่ยนงานหรือลาออกอย่างปลอดภัย, C=ฝึกการปกป้องอาณาเขตทางอารมณ์, D=อยากระบายอารมณ์

  const aq1 = answers['AQ1'] || '';
  const aq2 = answers['AQ2'] || '';
  const aq3 = answers['AQ3'] || '';
  const aq4 = answers['AQ4'] || '';
  const aq5 = answers['AQ5'] || '';

  // Type A: Genuinely Toxic — ตั้งใจทำร้าย (AQ1=ทุกวัน (A) AND AQ2 in [C,B] AND AQ4 in [B,C,D])
  // criteria: "AQ1=ทุกวัน AND AQ2 in [C,B] AND AQ4 in [B,C,D]"
  const isTypeA = (aq1 === 'A' && (aq2 === 'B' || aq2 === 'C') && (aq4 === 'B' || aq4 === 'C' || aq4 === 'D'));

  // Type B: Incompatible — สไตล์ขัดกัน (AQ1 in [B,C] AND AQ2=A AND AQ3 in [B,C])
  const isTypeB = ((aq1 === 'B' || aq1 === 'C') && aq2 === 'A' && (aq3 === 'B' || aq3 === 'C'));

  // Type C: Triggered — กำลัง stressed/burned out (AQ1=B AND AQ3=B)
  const isTypeC = (aq1 === 'B' && aq3 === 'B');

  // Type D: Mirror — Friction จากตัวเราเอง (AQ3=A)
  const isTypeD = (aq3 === 'A');

  if (isTypeA) return kb.toxic_rules_json.type_classification?.Type_A || null;
  if (isTypeB) return kb.toxic_rules_json.type_classification?.Type_B || null;
  if (isTypeC) return kb.toxic_rules_json.type_classification?.Type_C || null;
  if (isTypeD) return kb.toxic_rules_json.type_classification?.Type_D || null;

  // Fallback default
  return kb.toxic_rules_json.type_classification?.Type_A || null;
}

/**
 * Main AI Chat Engine logic
 */
export async function processSatiyaMessage(
  userId: string,
  userMessage: string,
  chatHistory: ChatMessage[],
  state: ChatState
): Promise<{ replyText: string; updatedState: ChatState; options?: string[] }> {
  // 1. Fetch user profile from Supabase
  let profile: UserProfile | null = null;
  try {
    const { data: userData } = await supabase
      .from('users')
      .select('*, results(*), kwi_responses(*)')
      .eq('id', userId)
      .maybeSingle();

    if (userData) {
      const results = userData.results?.[0] || {};
      const kwi = userData.kwi_responses?.[0] || {};
      profile = {
        id: userId,
        name: userData.full_name || 'ผู้ใช้',
        archetype_id: results.archetype_id || '',
        quadrant: results.quadrant_primary || 'Q1',
        jungian: results.jungian_type || 'TJ',
        via_dominant: results.via_dominant || '',
        vitality: kwi.vitality || 3.0,
        meaning: kwi.meaning || 3.0,
        connection: kwi.connection || 3.0,
        mastery: kwi.mastery || 3.0,
        resilience: kwi.resilience || 3.0,
        kwi_total: kwi.kwi_total || 3.0,
        wellbeing_pattern: kwi.wellbeing_pattern || 'P006_COASTING'
      };
    }
  } catch (err) {
    console.error("Error loading user profile:", err);
  }

  // Fallback empty profile if database not queried
  if (!profile) {
    profile = {
      id: userId,
      name: 'ผู้รับคำปรึกษา',
      archetype_id: 'Y_W-Q1-TJ',
      quadrant: 'Q1',
      jungian: 'TJ',
      via_dominant: 'W',
      vitality: 3.0,
      meaning: 3.0,
      connection: 3.0,
      mastery: 3.0,
      resilience: 3.0,
      kwi_total: 3.0,
      wellbeing_pattern: 'P006_COASTING'
    };
  }

  const updatedState = { ...state };

  // 2. CHECK FOR TOXIC WORKPLACE MODE
  if (!updatedState.isToxicMode && detectToxicKeywords(userMessage)) {
    updatedState.isToxicMode = true;
    updatedState.currentAqIndex = 0;
    updatedState.aqAnswers = {};
  }

  // 3. IF IN TOXIC MODE: PROCESS DIAGNOSTIC QUESTIONNAIRE
  if (updatedState.isToxicMode) {
    const aqIndex = updatedState.currentAqIndex;
    const currentQuestion = getAqQuestion(aqIndex);

    if (aqIndex > 0) {
      // Record answer for the PREVIOUS question
      const prevQuestion = getAqQuestion(aqIndex - 1);
      if (prevQuestion) {
        // Simple mapping: check if message matches choice text or letter
        let selectedKey = 'D'; // default fallback
        const msg = userMessage.toLowerCase();
        if (msg.includes('a') || (prevQuestion.ChoiceA && msg.includes(prevQuestion.ChoiceA.toLowerCase()))) selectedKey = 'A';
        else if (msg.includes('b') || (prevQuestion.ChoiceB && msg.includes(prevQuestion.ChoiceB.toLowerCase()))) selectedKey = 'B';
        else if (msg.includes('c') || (prevQuestion.ChoiceC && msg.includes(prevQuestion.ChoiceC.toLowerCase()))) selectedKey = 'C';
        else if (msg.includes('d') || (prevQuestion.ChoiceD && msg.includes(prevQuestion.ChoiceD.toLowerCase()))) selectedKey = 'D';

        updatedState.aqAnswers[prevQuestion.Q_ID] = selectedKey;
      }
    }

    // Check if we need to ask the next question
    if (updatedState.currentAqIndex < 5) {
      const nextQuestion = getAqQuestion(updatedState.currentAqIndex);
      updatedState.currentAqIndex++;

      let questionText = '';
      if (aqIndex === 0) {
        // For first question, wrap with introductory text
        questionText = kb.toxic_rules_json.chatbot_prompts?.opening_toxic || "ฟังดูเหนื่อยมากนะคะ ขอถามเพื่อช่วยได้ตรงขึ้นนะคะ — {AQ1}";
        questionText = questionText.replace('{AQ1}', nextQuestion.Question_TH);
      } else {
        questionText = nextQuestion.Question_TH;
      }

      // Prepare button choices
      const choices = [
        nextQuestion.ChoiceA,
        nextQuestion.ChoiceB,
        nextQuestion.ChoiceC,
        nextQuestion.ChoiceD
      ].filter(Boolean);

      return {
        replyText: questionText,
        updatedState,
        options: choices
      };
    } else {
      // Diagnostic complete! Transition out of toxic questions and classify
      updatedState.isToxicMode = false;
      const classification = classifyToxicType(updatedState.aqAnswers, profile);
      const isTypeA = classification?.label?.includes('Toxic');

      // Save classification result as insight in supabase (optional / silent)
      try {
        await supabase.from('validation_insights').insert({
          insight_type: 'toxic_workplace_classification',
          affected_pairs: [profile.archetype_id],
          recommendation: `User classified as ${classification?.label}. Primary Strategy: ${classification?.primary_strategy}`,
          status: 'pending'
        });
      } catch (e) { /* silent */ }

      // Get recommended theory text
      const recommendedTheories = (classification?.theories_to_use || [])
        .map((tid: string) => {
          const t = kb.theories.find((th: any) => th.Theory_ID === tid);
          return t ? `**${t.Name}**:\n${t.Key_Principles}\nขั้นตอน: ${t.Application_Steps}` : '';
        })
        .filter(Boolean)
        .join('\n\n');

      const systemPrompt = `คุณคือ Satiya AI Wellbeing Coach ผู้เชี่ยวชาญด้านจิตวิทยา
ผู้ใช้งานเพิ่งทำแบบทดสอบสภาวะแวดล้อมที่เป็นพิษในที่ทำงาน (Workplace Toxicity Diagnostic)
และได้รับการประเมินจำแนกกลุ่มเป็น: ${classification?.label || 'Genuinely Toxic'}
กลยุทธ์หลักที่ต้องใช้: ${classification?.primary_strategy || 'Grey Rock'}

ข้อมูลคลังความรู้เกี่ยวกับทฤษฎีที่ต้องแนะนำ:
${recommendedTheories}

ข้อมูลตัวผู้ใช้:
- ชื่อ: ${profile.name}
- บุคลิกภาพจริง (DEMM): Archetype=${profile.archetype_id} | Quadrant=${profile.quadrant} | Jungian=${profile.jungian}
- คะแนนมิติ KWI: Vitality=${profile.vitality}/5 Meaning=${profile.meaning}/5 Connection=${profile.connection}/5 Mastery=${profile.mastery}/5 Resilience=${profile.resilience}/5

กฎการพูดคุย:
1. ปฏิบัติตามแนวเสียงแชตบอต (Chatbot Tone) สำหรับกลุ่มนี้: ${classification?.chatbot_tone}
2. น้อมรับอารมณ์ความรู้สึกของผู้ใช้งานก่อนเสมอ (Validate feelings) ยืนยันว่าสิ่งที่เขารู้สึกและเจออยู่นั้นสมเหตุสมผล (Valid)
3. ${isTypeA ? "อย่าพยายามบอกให้ผู้ใช้ปรับตัวเข้าหาคนทำร้าย แต่ให้ช่วยวางแนวป้องกันตัวเอง (Boundary) และแผนการทางออก (Exit Plan) อย่างรอบคอบ" : "เสนอวิธีจัดการความขัดแย้งที่เหมาะสมกับคู่บุคลิกภาพ"}
4. ห้ามใช้คำวิชาการทางการแพทย์เด็ดขาด: "โรค", "ผิดปกติ", "วินิจฉัย", "อาการ", "พยาธิสภาพ"
5. หากผู้ใช้มีความเสี่ยงสูง (Resilience < 2.5 หรือ AQ4 เป็น Choice A/B) ให้ใส่เบอร์สายด่วนสุขภาพจิต 1323 กรมสุขภาพจิตไว้ท้ายข้อความอย่างอ่อนโยน
6. ตอบกลับเป็นภาษาไทยที่อบอุ่น อ่อนโยน เข้าอกเข้าใจ ไม่เป็นทางการจนเกินไป และน่าไว้วางใจ`;

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 1200,
        system: systemPrompt,
        messages: [
          ...chatHistory,
          { role: 'user', content: `ฉันกรอกข้อมูลการประเมินเสร็จแล้ว ช่วยวิเคราะห์ผลลัพธ์และให้คำแนะนำแบบเจาะลึกหน่อยค่ะ` }
        ]
      });

      const replyText = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join('');

      return {
        replyText,
        updatedState,
        options: ["ขอแผนการทางออก (Exit Plan)", "ขอคำแนะนำ Grey Rock สั้นๆ", "ขอบคุณสำหรับคำแนะนำ"]
      };
    }
  }

  // 4. STANDARD WELLBEING COACH MODE (NON-TOXIC)
  // Retrieve wellbeing state and matching advice
  const patternId = profile.wellbeing_pattern || 'P006_COASTING';
  const matchedPattern = kb.wellbeing_patterns.find((p: any) => p.Pattern_ID === patternId || p.Archetype === profile?.archetype_id);
  const patternName = matchedPattern?.Wellbeing_State || 'Healthy Coasting (ดีตามเกณฑ์)';
  const patternAdvice = matchedPattern?.Advice || 'ดูแลสุขภาพใจเป็นประจำ';
  const patternActivity = matchedPattern?.Recommended_Activity || 'ฝึกสมาธิเบื้องต้น';

  // Find lowest and highest dimensions
  const dims = [
    { name: 'พลังชีวิต (Vitality)', score: profile.vitality },
    { name: 'ความหมาย (Meaning)', score: profile.meaning },
    { name: 'ความสัมพันธ์ (Connection)', score: profile.connection },
    { name: 'ความเชี่ยวชาญ (Mastery)', score: profile.mastery },
    { name: 'ความยืดหยุ่น (Resilience)', score: profile.resilience }
  ];
  dims.sort((a, b) => a.score - b.score);
  const lowestDim = dims[0];
  const highestDim = dims[dims.length - 1];

  // Look up recommended theories based on KWI scoring rules
  const theorySelector = kb.kwi_scoring_rules.theory_selector || {};
  const recommendedTheoryIds = theorySelector[patternId] || ["GM_001", "SD_001"];
  const matchedTheories = recommendedTheoryIds
    .map((tid: string) => {
      const t = kb.theories.find((th: any) => th.Theory_ID === tid);
      return t ? `- **${t.Name}** (${t.Source}): ${t.Key_Principles} (ขั้นตอน: ${t.Application_Steps})` : '';
    })
    .filter(Boolean)
    .join('\n');

  // Format system prompt
  const systemPromptTemplate = kb.kwi_scoring_rules.chatbot_integration?.system_prompt_template || 
    `คุณคือ Satiya AI Wellbeing Coach
ข้อมูลผู้ใช้:
- ชื่อ: {name}
- KWI Pattern: {pattern_name}
- คะแนน: Vitality={v} Meaning={m} Connection={c} Mastery={a} Resilience={r}
- จุดแข็ง: {top_dimension}
- ต้องการดูแล: {low_dimension}
- DEMM: {archetype_id} | {quadrant} | {via_dominant}`;

  let systemPrompt = systemPromptTemplate
    .replace('{name}', profile.name)
    .replace('{pattern_name}', `${patternName} (${patternAdvice})`)
    .replace('{v}', String(profile.vitality))
    .replace('{m}', String(profile.meaning))
    .replace('{c}', String(profile.connection))
    .replace('{a}', String(profile.mastery))
    .replace('{r}', String(profile.resilience))
    .replace('{top_dimension}', `${highestDim.name} (คะแนน ${highestDim.score}/5)`)
    .replace('{low_dimension}', `${lowestDim.name} (คะแนน ${lowestDim.score}/5)`)
    .replace('{archetype_id}', profile.archetype_id)
    .replace('{quadrant}', profile.quadrant)
    .replace('{via_dominant}', profile.via_dominant);

  // Append matching theories & safety/tone guidelines
  systemPrompt += `\n\nข้อมูลทฤษฎีทางจิตวิทยาและคำแนะนำทางเลือกที่ระบบคัดสรรให้เหมาะสมกับระดับคะแนนมิติที่ต้องดูแล:\n${matchedTheories}`;
  systemPrompt += `\nแนะนำกิจกรรมพัฒนาสุขภาวะ: ${patternActivity}`;
  systemPrompt += `\n\nกฎการคุยของ Satiya AI Coach:
1. แนะนำข้อคิดอย่างอบอุ่น อ่อนโยน เข้าใจง่าย และไม่ตัดสิน
2. ห้ามพูดเชิงการแพทย์: ห้ามใช้คำว่า "โรค", "ผิดปกติ", "วินิจฉัย", "อาการ", "บำบัดรักษา"
3. เน้นการชวนมองและใช้จุดแข็ง (${highestDim.name}) มาช่วยพัฒนาส่วนที่บกพร่อง (${lowestDim.name})
4. หาก Resilience < 2.5 หรือมีสัญญาณวิกฤต (Crisis) ให้ใส่เบอร์สายด่วนกรมสุขภาพจิต 1323 ไว้ท้ายข้อความอย่างอ่อนโยน
5. ตอบกลับเป็นภาษาไทยที่สั้นกระชับ เข้าใจง่าย และจบประโยคด้วยคำถามชวนคิดเปิดใจ`;

  // Call Anthropic Claude
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20240620',
    max_tokens: 1000,
    system: systemPrompt,
    messages: chatHistory.map(m => ({ role: m.role, content: m.content })).concat({ role: 'user', content: userMessage })
  });

  const replyText = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('');

  return {
    replyText,
    updatedState,
    options: [
      `แนะนำวิธีเพิ่ม ${lowestDim.name}`,
      `วิเคราะห์ Archetype ของฉันด่วน`,
      `ขอแนวทางจัดระเบียบความคิด`,
      `ปรึกษาปัญหาเรื่องงานเครียด`
    ]
  };
}
