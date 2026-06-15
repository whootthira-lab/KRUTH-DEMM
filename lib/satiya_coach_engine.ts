import { supabase } from './supabase';
import Anthropic from '@anthropic-ai/sdk';
import kbRaw from './satiya_kb.json';
import { runDeterministicScorer } from './satiya_analyzer';
const kb = kbRaw as any;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'mock_key',
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
  currentGoal?: string;
  pendingSlots?: string[];
  currentDepthLevel?: number;
  lastScenarioTriggered?: string;
  userConversationalStyle?: string;
  momentumWeightsBuffer?: Record<string, number>;
  safetyTriggered?: boolean;
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
 * Helper to build a clean history where roles strictly alternate between 'user' and 'assistant'
 * and double-pushed user messages at the end are normalized.
 */
export function buildCleanMessages(chatHistory: ChatMessage[], userMessage: string): ChatMessage[] {
  const cleanHistory: ChatMessage[] = [];
  let lastRole: 'user' | 'assistant' | null = null;

  for (const msg of chatHistory) {
    if (!msg.content || !msg.content.trim()) continue;
    const role = msg.role === 'user' ? 'user' : 'assistant';

    // If consecutive messages have the same role, override with the latest one
    if (role === lastRole) {
      if (cleanHistory.length > 0) {
        cleanHistory[cleanHistory.length - 1] = { role, content: msg.content };
      }
    } else {
      cleanHistory.push({ role, content: msg.content });
      lastRole = role;
    }
  }

  // Append userMessage if cleanHistory does not already end with a 'user' message
  if (cleanHistory.length === 0 || cleanHistory[cleanHistory.length - 1].role !== 'user') {
    if (userMessage && userMessage.trim()) {
      cleanHistory.push({ role: 'user', content: userMessage });
    }
  } else if (userMessage && userMessage.trim()) {
    // If the last message is already 'user', update its content to the latest userMessage
    cleanHistory[cleanHistory.length - 1].content = userMessage;
  }

  return cleanHistory;
}

/**
 * Robust LLM Router / Failover Chain
 * Tries: Anthropic (Claude 3.5 Sonnet) -> OpenAI (GPT-4o-mini) -> Gemini (Gemini 1.5 Flash)
 */
export async function callGenerativeAI(
  systemPrompt: string,
  chatHistory: ChatMessage[],
  userMessage: string
): Promise<string> {
  const cleanMessages = buildCleanMessages(chatHistory, userMessage);

  // 1. Try Anthropic if key exists and is not empty
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'mock_key') {
    try {
      console.log("LLM Router: Trying Anthropic Claude...");
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 1200,
        system: systemPrompt,
        messages: cleanMessages.map(m => ({ role: m.role, content: m.content }))
      });
      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join('');
      if (text) return text;
    } catch (err) {
      console.error("LLM Router: Anthropic Claude failed:", err);
    }
  }

  // 2. Try OpenAI if key exists
  if (process.env.OPENAI_API_KEY) {
    try {
      console.log("LLM Router: Trying OpenAI GPT...");
      const messages = [
        { role: 'system', content: systemPrompt },
        ...cleanMessages.map(m => ({ role: m.role, content: m.content }))
      ];

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: messages,
          max_tokens: 1200
        })
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      } else {
        const errText = await res.text();
        console.error("LLM Router: OpenAI returned non-OK response:", errText);
      }
    } catch (err) {
      console.error("LLM Router: OpenAI failed:", err);
    }
  }

  // 3. Try Gemini if key exists
  if (process.env.GEMINI_API_KEY) {
    try {
      console.log("LLM Router: Trying Gemini...");
      const geminiContents = cleanMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: geminiContents,
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          generationConfig: {
            maxOutputTokens: 1200
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      } else {
        const errText = await res.text();
        console.error("LLM Router: Gemini returned non-OK response:", errText);
      }
    } catch (err) {
      console.error("LLM Router: Gemini failed:", err);
    }
  }

  // 4. Fallback if all providers fail
  throw new Error("All LLM Router providers failed or are unconfigured");
}

/**
 * Call Dialogue Router to decide coaching strategies, tones, and next scenarios
 */
async function callDialogueRouter(
  chatHistory: ChatMessage[],
  userMessage: string
): Promise<any> {
  const ROUTER_SYSTEM_PROMPT = `คุณคือ KRUTH MIND Dialogue Router Core ทำหน้าที่วิเคราะห์ข้อความล่าสุดของผู้ใช้และประวัติการสนทนาเพื่อเลือกกลยุทธ์การสนทนา โทนเสียง และฉากทัศน์คำถามจำลองถัดไป (Scenario Injection)

กติกาการวิเคราะห์:
- ask_decision: เลือก "SUMMARY_COACHING" หากประวัติการคุยยาวพอ (คุยกัน 4-5 ข้อความขึ้นไป) และพร้อมสำหรับการให้คำแนะนำแล้ว นอกเหนือจากนั้นเลือก "CONTINUE" เพื่อสนทนาต่อ
- chosen_strategy: PROGRESSIVE_CLARIFICATION (ถามเพื่อความกระจ่าง), ADAPTIVE_TONE (ปรับโทน), EMOTIONAL_CUSHIONING (ใส่เบาะรองอารมณ์)
- next_scenario_id: หากยังอยู่ในโหมดเก็บข้อมูล (CONTINUE) ให้เลือกฉากทัศน์ชวนคิดถัดไปที่เหมาะสมที่สุดในบริบท (SC_A ถึง SC_J) หากพร้อมคุยสรุปแล้วให้คืนค่า null

จงส่งผลลัพธ์กลับมาเป็นโครงสร้าง JSON ชุดนี้เท่านั้น ห้ามมีคำอธิบายหรือ Markdown block ใดๆ นอกเหนือจาก JSON:
{
  "ask_decision": "CONTINUE" | "SUMMARY_COACHING",
  "target_dimension": "VITALITY" | "MEANING" | "CONNECTION" | "MASTERY" | "RESILIENCE",
  "chosen_strategy": "PROGRESSIVE_CLARIFICATION" | "ADAPTIVE_TONE" | "EMOTIONAL_CUSHIONING",
  "adaptive_tone": "GENTLE_AND_REFLECTIVE" | "ANALYTICAL_FOCUS" | "SUPPORTIVE_WARM",
  "inject_emotional_cushion": boolean,
  "next_scenario_id": "SC_A" | "SC_B" | "SC_C" | "SC_D" | "SC_E" | "SC_F" | "SC_G" | "SC_H" | "SC_I" | "SC_J" | null
}`;

  try {
    const messages = [
      { role: 'system', content: ROUTER_SYSTEM_PROMPT },
      ...chatHistory.slice(-6).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage }
    ];

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("No OpenAI API key for Dialogue Router");
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        response_format: { type: 'json_object' },
        max_tokens: 300
      })
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) {
        return JSON.parse(text.trim());
      }
    } else {
      const err = await res.text();
      console.warn("Dialogue Router OpenAI returned non-OK:", err);
    }
  } catch (err) {
    console.error("Dialogue Router failed, using default fallback:", err);
  }

  // Fallback default
  return {
    ask_decision: "CONTINUE",
    target_dimension: "CONNECTION",
    chosen_strategy: "PROGRESSIVE_CLARIFICATION",
    adaptive_tone: "GENTLE_AND_REFLECTIVE",
    inject_emotional_cushion: true,
    next_scenario_id: null
  };
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
  const aq1 = answers['AQ1'] || '';
  const aq2 = answers['AQ2'] || '';
  const aq3 = answers['AQ3'] || '';
  const aq4 = answers['AQ4'] || '';

  const isTypeA = (aq1 === 'A' && (aq2 === 'B' || aq2 === 'C') && (aq4 === 'B' || aq4 === 'C' || aq4 === 'D'));
  const isTypeB = ((aq1 === 'B' || aq1 === 'C') && aq2 === 'A' && (aq3 === 'B' || aq3 === 'C'));
  const isTypeC = (aq1 === 'B' && aq3 === 'B');
  const isTypeD = (aq3 === 'A');

  if (isTypeA) return kb.toxic_rules_json.type_classification?.Type_A || null;
  if (isTypeB) return kb.toxic_rules_json.type_classification?.Type_B || null;
  if (isTypeC) return kb.toxic_rules_json.type_classification?.Type_C || null;
  if (isTypeD) return kb.toxic_rules_json.type_classification?.Type_D || null;

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
      const prevQuestion = getAqQuestion(aqIndex - 1);
      if (prevQuestion) {
        let selectedKey = 'D';
        const msg = userMessage.toLowerCase();
        if (msg.includes('a') || (prevQuestion.ChoiceA && msg.includes(prevQuestion.ChoiceA.toLowerCase()))) selectedKey = 'A';
        else if (msg.includes('b') || (prevQuestion.ChoiceB && msg.includes(prevQuestion.ChoiceB.toLowerCase()))) selectedKey = 'B';
        else if (msg.includes('c') || (prevQuestion.ChoiceC && msg.includes(prevQuestion.ChoiceC.toLowerCase()))) selectedKey = 'C';
        else if (msg.includes('d') || (prevQuestion.ChoiceD && msg.includes(prevQuestion.ChoiceD.toLowerCase()))) selectedKey = 'D';

        updatedState.aqAnswers[prevQuestion.Q_ID] = selectedKey;
      }
    }

    if (updatedState.currentAqIndex < 5) {
      const nextQuestion = getAqQuestion(updatedState.currentAqIndex);
      updatedState.currentAqIndex++;

      let questionText = '';
      if (aqIndex === 0) {
        questionText = kb.toxic_rules_json.chatbot_prompts?.opening_toxic || "ฟังดูเหนื่อยมากนะคะ ขอถามเพื่อช่วยได้ตรงขึ้นนะคะ — {AQ1}";
        questionText = questionText.replace('{AQ1}', nextQuestion.Question_TH);
      } else {
        questionText = nextQuestion.Question_TH;
      }

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
      updatedState.isToxicMode = false;
      const classification = classifyToxicType(updatedState.aqAnswers, profile);
      const isTypeA = classification?.label?.includes('Toxic');

      try {
        await supabase.from('validation_insights').insert({
          insight_type: 'toxic_workplace_classification',
          affected_pairs: [profile.archetype_id],
          recommendation: `User classified as ${classification?.label}. Primary Strategy: ${classification?.primary_strategy}`,
          status: 'pending'
        });
      } catch (e) { /* silent */ }

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

      let replyText = '';
      try {
        replyText = await callGenerativeAI(
          systemPrompt,
          chatHistory,
          `ฉันกรอกข้อมูลการประเมินเสร็จแล้ว ช่วยวิเคราะห์ผลลัพธ์และให้คำแนะนำแบบเจาะลึกหน่อยค่ะ`
        );
      } catch (apiErr: any) {
        console.error("LLM Router failed (Toxicity), using rule-based fallback:", apiErr);
        replyText = `สวัสดีค่ะคุณ ${profile.name} (ขณะนี้ระบบวิเคราะห์ AI ขัดข้องชั่วคราว แต่ฉันขอเสนอแนวทางด้วยระบบวิเคราะห์เบื้องหลังของฉันนะคะ) 

จากการวิเคราะห์ Workplace Toxicity ที่คุณเจออยู่ สภาวะแวดล้อมของคุณจัดอยู่ในกลุ่ม **"${classification?.label || 'สภาพแวดล้อมที่เป็นพิษ'}"** 
และมีข้อเสนอแนะหลักคือการปฏิบัติตามแนวทาง **"${classification?.primary_strategy || 'ตั้งแนวป้องกันตนเอง (Boundary)'}"**

💡 **คำแนะนำเร่งด่วนสำหรับคุณ:**
1. **ตั้งรับอย่างมั่นคง (Boundary):** หลีกเลี่ยงการตอบโต้ทางอารมณ์กับคนที่เป็นพิษ ให้เน้นสื่อสารเฉพาะเรื่องงานเป็นหลักแบบลายลักษณ์อักษร
2. **วางแผนทางออก (Exit Plan):** เริ่มทบทวนทางเลือกอื่น ๆ มองหาโอกาสหรือแผนงานสำรองเพื่อปกป้องสภาพจิตใจของคุณในระยะยาว
3. **ฟื้นฟูตนเอง:** หากสภาวะจิตใจอยู่ในเกณฑ์ตึงเครียดสูง แนะนำให้ปรึกษาสายด่วนกรมสุขภาพจิต 1323 นะคะ`;
      }

      return {
        replyText,
        updatedState,
        options: ["ขอแผนการทางออก (Exit Plan)", "ขอคำแนะนำ Grey Rock สั้นๆ", "ขอบคุณสำหรับคำแนะนำ"]
      };
    }
  }

  // 4. STANDARD WELLBEING COACH MODE (NON-TOXIC)
  // Initialize Dialogue Router State
  if (!updatedState.pendingSlots) {
    updatedState.pendingSlots = ["F_hope", "F_support", "F_sorry", "F_understand", "F_care"];
    updatedState.currentGoal = "assess_wellbeing";
    updatedState.currentDepthLevel = 1;
  }

  // 4.1 Deterministic Slot Scanning Gate (TypeScript side)
  const msgLower = userMessage.toLowerCase();
  const slotKeywords: Record<string, string[]> = {
    F_hope: ["หวัง", "วันข้างหน้า", "อนาคต", "โอกาส", "สู้"],
    F_support: ["ช่วย", "สนับสนุน", "ให้กำลังใจ", "ดูแล", "เข้าใจกัน"],
    F_sorry: ["ขอโทษ", "เสียใจ", "ขออภัย", "ผิดไปแล้ว"],
    F_understand: ["เข้าใจ", "เห็นใจ", "ยอมรับ", "แชร์"],
    F_care: ["ห่วง", "เป็นห่วง", "ห่วงใย", "แคร์", "รัก"]
  };

  Object.entries(slotKeywords).forEach(([slot, keywords]) => {
    if (keywords.some(kw => msgLower.includes(kw))) {
      updatedState.pendingSlots = updatedState.pendingSlots?.filter(s => s !== slot);
    }
  });

  const userMsgCount = chatHistory.filter(m => m.role === 'user').length;
  let forceCoachingSummary = false;
  if ((updatedState.pendingSlots?.length === 0) || userMsgCount >= 4) {
    updatedState.currentGoal = "COACHING_SUMMARY";
    forceCoachingSummary = true;
  }

  // 4.2 Cognitive Strategy Router Call
  let routerDecision = {
    ask_decision: forceCoachingSummary ? "SUMMARY_COACHING" : "CONTINUE",
    target_dimension: "CONNECTION",
    chosen_strategy: "PROGRESSIVE_CLARIFICATION",
    adaptive_tone: "GENTLE_AND_REFLECTIVE",
    inject_emotional_cushion: true,
    next_scenario_id: null as string | null
  };

  if (!forceCoachingSummary) {
    routerDecision = await callDialogueRouter(chatHistory, userMessage);
  }

  const SCENARIOS: Record<string, string> = {
    SC_A: `หากเธอจำเป็นต้องเลือกระหว่างความถูกต้องของกติกาโรงเรียน/องค์กร กับผลประโยชน์ของเพื่อนร่วมกลุ่มที่กำลังเดือดร้อน เธอจะตัดสินใจอย่างไร?`,
    SC_B: `ถ้าอยู่ๆ มีเพื่อนในทีมเดินมาขึ้นเสียงใส่เธอต่อหน้าคนเยอะๆ ทั้งที่เธอไม่ได้ทำอะไรผิด สิ่งแรกที่เธอจะตอบโต้หรือทำคืออะไร?`,
    SC_C: `เมื่อผลงานหรืองานวิจัยที่เธอทุ่มเททำสำเร็จจนได้รับรางวัลใหญ่ชื่นชม ลึกๆ เธอรู้สึกว่ามันสำเร็จเพราะอะไร และจะพูดคุยเรื่องนี้กับทีมอย่างไร?`,
    SC_D: `หากแผนงานที่วางไว้พังลงต่อหน้าต่อตาเพราะสมาชิกคนหนึ่งในกิลด์/ในทีมทำพลาด ความคิดแรกสุดที่โผล่ขึ้นมาในใจเธอคืออะไร?`,
    SC_E: `ถ้าเห็นเพื่อนสนิทเดินมาระบายด้วยแววตาหมดหวังว่า 'เหนื่อยมาก ไม่อยากสู้ต่อแล้ว' ประโยคแรกที่เธอจะพูดเพื่อดึงสติและปลอบเขาคืออะไร?`,
    SC_F: `เวลาเห็นคนอื่นทำพฤติกรรมที่เธอรู้สึกว่าไม่เหมาะสม ขัดหูขัดตาปะทะตรงหน้า ความรู้สึกในใจมันบอกเธอว่าอย่างไร และเธอมีวิธีจัดการความรู้สึกนั้นอย่างไร?`,
    SC_G: `ในจังหวะที่เกมตามหลังหนักๆ หรือชีวิตจริงเจอเรื่องกดดันอึดอัดใจจนขีดสุด ปกติเธอมีคำพูดติดปากหรือสไตล์ข้อความระบายความโกรธแบบไหน?`,
    SC_H: `ถ้าทีมต้องการคนยอมสละเวลาส่วนตัวช่วงวันหยุดมาช่วยแก้งานด่วนเพื่อเซฟระบบภาพรวม โดยไม่มีค่าตอบแทนพิเศษเพิ่ม เธอจะตอบรับอย่างไร?`,
    SC_I: `หากเธอพบว่าคุณครูหรือหัวหน้างานประเมินคะแนน/ให้โบนัสเพื่อนร่วมเลนร่วมทีมเยอะกว่าเธอ ทั้งที่เธอทำงานหนักเท่ากัน เธอจะมีแนวทางคุยเรื่องนี้อย่างไร?`,
    SC_J: `ในวันที่เธอเองก็พลังงานหมดกายเหนื่อยใจมาก (Low Vitality) แต่คนรอบตัวเดินเข้ามาขอความช่วยเหลือขอคำปรึกษาพร้อมกัน เธอจะจัดการบาลานซ์มันอย่างไร?`
  };

  let scenarioText = "";
  if (routerDecision.next_scenario_id) {
    scenarioText = SCENARIOS[routerDecision.next_scenario_id] || "";
    updatedState.lastScenarioTriggered = routerDecision.next_scenario_id;
  }

  const patternId = profile.wellbeing_pattern || 'P006_COASTING';
  const matchedPattern = kb.wellbeing_patterns.find((p: any) => p.Pattern_ID === patternId || p.Archetype === profile?.archetype_id);
  const patternName = matchedPattern?.Wellbeing_State || 'Healthy Coasting (ดีตามเกณฑ์)';
  const patternAdvice = matchedPattern?.Advice || 'ดูแลสุขภาพใจเป็นประจำ';
  const patternActivity = matchedPattern?.Recommended_Activity || 'ฝึกสมาธิเบื้องต้น';

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

  const theorySelector = kb.kwi_scoring_rules.theory_selector || {};
  const recommendedTheoryIds = theorySelector[patternId] || ["GM_001", "SD_001"];
  const matchedTheories = recommendedTheoryIds
    .map((tid: string) => {
      const t = kb.theories.find((th: any) => th.Theory_ID === tid);
      return t ? `- **${t.Name}** (${t.Source}): ${t.Key_Principles} (ขั้นตอน: ${t.Application_Steps})` : '';
    })
    .filter(Boolean)
    .join('\n');

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

  systemPrompt += `\n\nข้อมูลทฤษฎีทางจิตวิทยาและคำแนะนำทางเลือกที่ระบบคัดสรรให้เหมาะสมกับระดับคะแนนมิติที่ต้องดูแล:\n${matchedTheories}`;
  systemPrompt += `\nแนะนำกิจกรรมพัฒนาสุขภาวะ: ${patternActivity}`;

  // Custom dialogue state guidelines
  systemPrompt += `\n\n[สถานะกลยุทธ์ของระบบ (Dialogue Strategy Guidance)]`;
  if (routerDecision.inject_emotional_cushion) {
    systemPrompt += `\n- คุณต้องเริ่มต้นประโยคแรกด้วย "เบาะรองอารมณ์" (Emotional Cushioning) เพื่อซับอารมณ์ ปลอบโยน ยอมรับ หรือแสดงความเข้าใจในความรู้สึกของผู้ใช้อย่างอบอุ่นก่อนเสมอ`;
  }
  
  if (routerDecision.adaptive_tone === "GENTLE_AND_REFLECTIVE") {
    systemPrompt += `\n- โทนเสียงและการพูดคุย: Gentle and Reflective (ใช้คำสุภาพ อ่อนโยน เน้นการกระตุ้นให้เกิดการไตร่ตรองสภาวะอารมณ์ภายใน)`;
  } else if (routerDecision.adaptive_tone === "ANALYTICAL_FOCUS") {
    systemPrompt += `\n- โทนเสียงและการพูดคุย: Analytical Focus (เน้นการอธิบายด้วยเหตุและผล การจัดระเบียบตรรกะความคิดอย่างสร้างสรรค์)`;
  } else if (routerDecision.adaptive_tone === "SUPPORTIVE_WARM") {
    systemPrompt += `\n- โทนเสียงและการพูดคุย: Supportive and Warm (เน้นการชมเชยจุดแข็ง ให้ความไว้วางใจ และให้กำลังใจชวนก้าวข้ามปัญหา)`;
  }

  if (routerDecision.ask_decision === "SUMMARY_COACHING") {
    systemPrompt += `\n- [โหมดให้คำปรึกษาและสรุปผล]: คุณได้ประเมินมิติต่างๆ ครบถ้วนแล้ว จงทำการสรุปผลลัพธ์สุขภาวะของผู้ใช้ ให้คำแนะนำการบริหารดูแลใจเฉพาะบุคคลโดยดึงจุดแข็งมาเติมเต็มจุดอ่อน และสรุปเซสชันการคุยอย่างเป็นมิตร`;
  } else {
    systemPrompt += `\n- [โหมดสแกนพฤติกรรม]: คุณกำลังอยู่ระหว่างเก็บข้อมูลพฤติกรรม หากมีฉากทัศน์ชวนคิดด้านล่างนี้ ให้สอดแทรกคำถามนี้เพื่อชวนคุยอย่างเป็นธรรมชาติและไม่บังคับ: \n"${scenarioText}"`;
  }

  systemPrompt += `\n\nกฎการคุยของ Satiya AI Coach:
1. แนะนำข้อคิดอย่างอบอุ่น อ่อนโยน เข้าใจง่าย และไม่ตัดสิน
2. ห้ามพูดเชิงการแพทย์: ห้ามใช้คำว่า "โรค", "ผิดปกติ", "วินิจฉัย", "อาการ", "บำบัดรักษา"
3. เน้นการชวนมองและใช้จุดแข็ง (${highestDim.name}) มาช่วยพัฒนาส่วนที่บกพร่อง (${lowestDim.name})
4. หาก Resilience < 2.5 หรือมีสัญญาณวิกฤต (Crisis) ให้ใส่เบอร์สายด่วนกรมสุขภาพจิต 1323 ไว้ท้ายข้อความอย่างอ่อนโยน
5. ตอบกลับเป็นภาษาไทยที่สั้นกระชับ เข้าใจง่าย และจบประโยคด้วยคำถามชวนคิดเปิดใจ`;

  let replyText = '';
  try {
    replyText = await callGenerativeAI(systemPrompt, chatHistory, userMessage);
  } catch (apiErr: any) {
    console.error("LLM Router failed (Wellbeing), using rule-based fallback:", apiErr);
    replyText = `สวัสดีค่ะคุณ ${profile.name} โค้ชซาติยะยินดีต้อนรับค่ะ (ขณะนี้บริการ AI เชื่อมต่อขัดข้องชั่วคราว โค้ชขอแจ้งคำแนะนำที่คัดเลือกมาเฉพาะสำหรับสุขภาวะใจของคุณทดแทนนะคะ)

📊 **จากการวิเคราะห์คะแนนสุขภาวะ KWI ของคุณ:**
* 🌟 **มิติที่โดดเด่นโดนใจสูงสุดของคุณคือ ${highestDim.name}** (คะแนน ${highestDim.score}/5)
* 🧘 **มิติที่คุณควรหันมาดูแลเป็นพิเศษคือ ${lowestDim.name}** (คะแนน ${lowestDim.score}/5)

สภาวะสุขภาพใจของคุณในปัจจุบันสอดคล้องกับรูปแบบ **"${patternName}"** 
💡 **คำแนะนำเพื่อการเติบโต:** {pattern_advice}
🎯 **กิจกรรมที่โค้ชแนะนำให้ลองทำวันนี้:** {pattern_activity}

คุณอยากคุยเรื่องอะไรเพิ่มเติม หรือสนใจจะปรับปรุงดูแล ${lowestDim.name} ก่อนดีคะ? ปรึกษาได้ตลอดเลยนะคะ โค้ชพร้อมเคียงข้างรับฟังเสมอค่ะ`
      .replace('{pattern_advice}', patternAdvice)
      .replace('{pattern_activity}', patternActivity);
  }

  // Generate dynamic options
  let dynamicOptions = [
    `แนะนำวิธีเพิ่ม ${lowestDim.name}`,
    `วิเคราะห์ Archetype ของฉันด่วน`,
    `ขอแนวทางจัดระเบียบความคิด`,
    `ปรึกษาปัญหาเรื่องงานเครียด`
  ];

  if (routerDecision.ask_decision === "SUMMARY_COACHING") {
    dynamicOptions = [
      "สรุปแนวทางพัฒนาสุขภาวะเฉพาะตัว",
      "ขอบคุณสำหรับคำแนะนำทั้งหมด",
      "เริ่มทำการประเมินมิติใหม่อีกครั้ง"
    ];
  } else if (routerDecision.next_scenario_id) {
    dynamicOptions = [
      "ขอตอบฉากทัศน์ชวนคิดนี้",
      `ขอกลยุทธ์พัฒนา ${routerDecision.target_dimension}`,
      "แนะนำเรื่องอื่นแทนได้ไหมคะ"
    ];
  }

  return {
    replyText,
    updatedState,
    options: dynamicOptions
  };
}
