import { supabase } from './supabase';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface LayerResult {
  score: number;
  type?: string;
  intensity?: number;
  complexity?: number;
  direction?: string;
  agency?: string;
  details: string;
}

export interface AnalysisOutput {
  layer1: { type: string; intensity: number; complexity: number; score: number; details: string };
  layer2: { type: string; intensity: number; direction: string; score: number; details: string };
  layer3: { type: string; intensity: number; agency: string; score: number; details: string };
  layer4: { score: number; details: string };
  layer5: { consistency: number; evolution_rate: number; trend: string; score: number; details: string };
  layer6: { score: number; details: string };
  layer7: { score: number; details: string };
  layer8: { score: number; details: string };
  delta_report: {
    primary_divergence: string;
    ui_reflection_text: string;
  };
  safety_override?: boolean;
}

/**
 * Deterministic Specialist: Fast Regex Scorer
 */
export function runDeterministicScorer(message: string) {
  // Regex patterns mapping to the Psycholinguistic Target Markers
  const swearWords = /เฮงซวย|แม่ง|เหี้ย|สัตว์|ควาย|fucking|shitty/gi;
  const insultWords = /ด่า|โง่|ทุเรศ|บ้า|เลว|กระจอก/gi;
  const threatWords = /ขู่|ทำร้าย|จะฆ่า|คอยดู|ระวังตัว/gi;

  const shouldWords = /ควร|ต้อง|บังคับ|ต้องทำ|ควรจะ/g;
  const wrongWords = /ผิด|ไม่ดี|แย่|บกพร่อง|พลาด/g;
  const rightWords = /ถูก|เหมาะสม|ดีงาม|ถูกต้อง/g;

  const supportWords = /เข้าใจ|ช่วย|ให้กำลังใจ|สนับสนุน|เป็นห่วง|โอเค/g;
  const praiseWords = /เก่ง|ยอดเยี่ยม|ดีมาก|สุดยอด|ชม/g;
  const hopeWords = /หวัง|วันข้างหน้า|สู้|มีโอกาส|ผ่านไปได้/g;

  const sorryWords = /ขอโทษ|เสียใจ|ขออภัย/g;
  const understandWords = /เข้าใจว่า|เห็นใจ|แชร์/g;
  const careWords = /ห่วงใย|แคร์|รัก|กอด/g;

  const angryWords = /โกรธ|โมโห|เดือด|ฉุน/g;
  const frustratedWords = /รำคาญ|เหนื่อยแล้ว|เบื่อ|เซ็ง/g;
  const impatientWords = /ช้า|รีบ|ไวๆ|ด่วน/g;

  // Counts (F values)
  const fSwear = (message.match(swearWords) || []).length;
  const fInsult = (message.match(insultWords) || []).length;
  const fThreat = (message.match(threatWords) || []).length;

  const fShould = (message.match(shouldWords) || []).length;
  const fWrong = (message.match(wrongWords) || []).length;
  const fRight = (message.match(rightWords) || []).length;

  const fSupport = (message.match(supportWords) || []).length;
  const fPraise = (message.match(praiseWords) || []).length;
  const fHope = (message.match(hopeWords) || []).length;

  const fSorry = (message.match(sorryWords) || []).length;
  const fUnderstand = (message.match(understandWords) || []).length;
  const fCare = (message.match(careWords) || []).length;

  const fAngry = (message.match(angryWords) || []).length;
  const fFrustrated = (message.match(frustratedWords) || []).length;
  const fImpatient = (message.match(impatientWords) || []).length;

  // Weighted score equations (coefficients: w1=0.5, w2=0.3, w3=0.2)
  const aggression = 0.5 * fSwear + 0.3 * fInsult + 0.2 * fThreat;
  const judgment = 0.5 * fShould + 0.3 * fWrong + 0.2 * fRight;
  const encouragement = 0.5 * fSupport + 0.3 * fPraise + 0.2 * fHope;
  const empathy = 0.5 * fSorry + 0.3 * fUnderstand + 0.2 * fCare;
  const anger = 0.5 * fAngry + 0.3 * fFrustrated + 0.2 * fImpatient;

  // Pro-social moral profile score
  // Moral_Profile = (beta * Empathy + delta * Encouragement) - (alpha * Judgment + gamma * Aggression)
  // Let coefficients beta=1.0, delta=1.0, alpha=1.0, gamma=1.0
  const moralProfile = (empathy + encouragement) - (judgment + aggression);

  return {
    fSwear, fShould, fSupport, fSorry,
    aggression, judgment, encouragement, empathy, anger, moralProfile
  };
}

/**
 * Router AI Call with OpenAI GPT-4o-mini and Gemini 1.5 Flash fallback
 */
async function callRouterAI(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const providers = [
    // 1. OpenAI GPT-4o-mini
    async () => {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OpenAI API Key not configured");
      }
      console.log("Router AI: Trying GPT-4o-mini...");
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          max_tokens: 500
        })
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      }
      const errText = await res.text();
      throw new Error(`OpenAI GPT-4o-mini failed: ${errText}`);
    },
    // 2. Gemini 1.5 Flash
    async () => {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("Gemini API Key not configured");
      }
      console.log("Router AI: Trying Gemini 1.5 Flash...");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: userPrompt }] }
          ],
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 500
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }
      const errText = await res.text();
      throw new Error(`Gemini 1.5 Flash failed: ${errText}`);
    }
  ];

  let lastError: any = null;
  for (const provider of providers) {
    try {
      return await provider();
    } catch (err) {
      console.warn("Router AI provider failed, trying next fallback...", err);
      lastError = err;
    }
  }
  throw lastError || new Error("All Router AI providers failed");
}

/**
 * Cognitive Scorer Fallback Chain: Claude 3.5 Sonnet -> GPT-4o -> Gemini 1.5 Pro
 */
async function callGenerativeAIWithFallback(
  systemPrompt: string,
  userPrompt: string,
  requireJson: boolean = false
): Promise<string> {
  const providers = [
    // 1. Claude 3.5 Sonnet
    async () => {
      if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'mock_key') {
        throw new Error("Anthropic API Key not configured");
      }
      console.log("Cognitive Scorer: Trying Claude 3.5 Sonnet...");
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join('');
      if (text) return text;
      throw new Error("Empty response from Anthropic");
    },
    // 2. OpenAI GPT-4o
    async () => {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OpenAI API Key not configured");
      }
      console.log("Cognitive Scorer: Trying OpenAI GPT-4o...");
      const body: any = {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 1500
      };
      if (requireJson) {
        body.response_format = { type: 'json_object' };
      }
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      }
      const errText = await res.text();
      throw new Error(`OpenAI GPT-4o failed: ${errText}`);
    },
    // 3. Gemini 1.5 Pro
    async () => {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("Gemini API Key not configured");
      }
      console.log("Cognitive Scorer: Trying Gemini 1.5 Pro...");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const payload: any = {
        contents: [
          { role: 'user', parts: [{ text: userPrompt }] }
        ],
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        generationConfig: {
          maxOutputTokens: 1500
        }
      };
      if (requireJson) {
        payload.generationConfig.responseMimeType = 'application/json';
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }
      const errText = await res.text();
      throw new Error(`Gemini 1.5 Pro failed: ${errText}`);
    }
  ];

  let lastError: any = null;
  for (const provider of providers) {
    try {
      return await provider();
    } catch (err) {
      console.warn("Cognitive provider attempt failed, trying next fallback...", err);
      lastError = err;
    }
  }
  throw lastError || new Error("All cognitive fallback providers failed");
}

/**
 * Main function to analyze Satiya chat history using 8-Layer Personality Framework
 */
export async function analyzeSpeech8Layers(
  userId: string,
  sessionId: string,
  chatHistory: { role: 'user' | 'assistant'; content: string }[]
): Promise<AnalysisOutput | null> {
  if (!chatHistory || chatHistory.length === 0) {
    return null;
  }

  // 1. Fetch user's baseline results from Supabase
  let baselineInfo = "No quiz baseline found.";
  try {
    const { data: results } = await supabase
      .from('results')
      .select('archetype_id, quadrant_primary, jungian_type')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: kwi } = await supabase
      .from('kwi_responses')
      .select('vitality, meaning, connection, mastery, resilience')
      .eq('user_id', userId)
      .maybeSingle();

    if (results && kwi) {
      baselineInfo = `Quiz Baseline: Archetype=${results.archetype_id}, Quadrant=${results.quadrant_primary}, Jungian=${results.jungian_type}. KWI: Vitality=${kwi.vitality}/5, Meaning=${kwi.meaning}/5, Connection=${kwi.connection}/5, Mastery=${kwi.mastery}/5, Resilience=${kwi.resilience}/5.`;
    }
  } catch (err) {
    console.error("Error loading baseline for analysis:", err);
  }

  // 1.5 Fetch historical chat logs from Supabase
  let recentHistoryText = "No recent chat history in the last 2-3 months.";
  let olderHistoryText = "No older chat history beyond 3 months.";
  
  try {
    const { data: logs } = await supabase
      .from('satiya_chat_logs')
      .select('sender, message, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(300);

    if (logs && logs.length > 0) {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const recentLogs: string[] = [];
      const olderLogs: string[] = [];

      // Reverse to get chronological order
      const sortedLogs = [...logs].reverse();
      sortedLogs.forEach(log => {
        const logDate = new Date(log.created_at);
        const text = `${log.sender === 'user' ? 'User' : 'Coach'}: ${log.message}`;
        if (logDate >= ninetyDaysAgo) {
          recentLogs.push(text);
        } else {
          olderLogs.push(text);
        }
      });

      if (recentLogs.length > 0) {
        recentHistoryText = recentLogs.join('\n');
      }
      if (olderLogs.length > 0) {
        olderHistoryText = olderLogs.join('\n');
      }
    }
  } catch (err) {
    console.error("Error loading historical chat logs for analysis:", err);
  }

  // Format current session chat history into text for LLM
  const currentSessionTranscript = chatHistory
    .map(m => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`)
    .join('\n');

  // ================= LAYER 1: ROUTER AI =================
  const ROUTER_SYSTEM_PROMPT = `คุณคือ KRUTH MIND Router Core ทำหน้าที่วิเคราะห์ข้อความล่าสุดของผู้ใช้และประวัติการสนทนา 
เพื่อจำแนกประเภทและกำหนดน้ำหนักเลเยอร์จิตวิทยา (8 เลเยอร์) โดยมีเงื่อนไขดังนี้:
1. หากพบสัญญาณวิกฤต (ทำร้ายตัวเอง/ผู้อื่น/ฆ่าตัวตาย/ความรุนแรง) ให้ตั้งค่า safety_override: true ทันที
2. กำหนดค่านั่งหนัก w1_context ถึง w8_social_dynamic ให้สอดคล้องกับบริบท โดยผลรวมของน้ำหนักทั้งหมดต้องเท่ากับ 1.0 เสมอ (Strictly Normalized to 1.0)
   - หากผู้ใช้แสดงอารมณ์รุนแรง (เช่น โกรธจัด เศร้าโศก) ให้เพิ่มน้ำหนักเลเยอร์ 7 (Emotional Regulation) และเลเยอร์ 8 (Social Dynamics)
   - หากผู้ใช้พยายามอธิบายเหตุผลหรือสะท้อนจิตใจ ให้เพิ่มน้ำหนักเลเยอร์ 6 (Meta-Cognition) และเลเยอร์ 4 (Self-Reflection)

จงส่งผลลัพธ์กลับมาเป็นรูปแบบ JSON ชุดนี้เท่านั้น (ห้ามมี markdown block หรือข้อความอธิบายใดๆ นอกเหนือจาก JSON):
{
  "context_type": "morality" | "relationship" | "decision" | "emotion" | "self_reflection" | "encouragement" | "conflict",
  "safety_override": boolean,
  "active_layers": number[],
  "dynamic_weights": {
    "w1_context": number,
    "w2_third_party": number,
    "w3_situation": number,
    "w4_self_reflect": number,
    "w5_consistency": number,
    "w6_meta_cognition": number,
    "w7_emo_regulation": number,
    "w8_social_dynamic": number
  },
  "confidence_score": number
}`;

  let routerJson: any = {
    context_type: "emotion",
    safety_override: false,
    active_layers: [1, 2, 3, 4, 5, 6, 7, 8],
    dynamic_weights: {
      w1_context: 0.15,
      w2_third_party: 0.15,
      w3_situation: 0.10,
      w4_self_reflect: 0.15,
      w5_consistency: 0.10,
      w6_meta_cognition: 0.15,
      w7_emo_regulation: 0.10,
      w8_social_dynamic: 0.10
    },
    confidence_score: 0.9
  };

  try {
    const routerResponseText = await callRouterAI(
      ROUTER_SYSTEM_PROMPT,
      `User's latest message and recent chat history:\n${currentSessionTranscript}`
    );
    const cleanRouterText = routerResponseText.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    routerJson = JSON.parse(cleanRouterText);
  } catch (err) {
    console.warn("Router AI failed, using fallback static weights:", err);
  }

  // Calculate applied weights using L1 Normalization & Momentum Weighting
  const theta = 0.7;
  const appliedWeights: Record<string, number> = {};
  const layers = [
    'w1_context', 'w2_third_party', 'w3_situation', 'w4_self_reflect',
    'w5_consistency', 'w6_meta_cognition', 'w7_emo_regulation', 'w8_social_dynamic'
  ];

  // Fetch last profile to calculate Momentum
  let historicalWeights: Record<string, number> | null = null;
  try {
    const { data: lastProfile } = await supabase
      .from('satiya_behavioral_profiles')
      .select('applied_weights')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (lastProfile && lastProfile.applied_weights) {
      historicalWeights = lastProfile.applied_weights as Record<string, number>;
    }
  } catch (err) {
    console.warn("Could not load historical weights for momentum:", err);
  }

  layers.forEach(k => {
    const currentVal = (routerJson.dynamic_weights && routerJson.dynamic_weights[k] !== undefined) ? routerJson.dynamic_weights[k] : 0.125;
    if (historicalWeights && historicalWeights[k] !== undefined) {
      appliedWeights[k] = theta * historicalWeights[k] + (1 - theta) * currentVal;
    } else {
      appliedWeights[k] = currentVal;
    }
  });

  // L1 Normalization
  let sumApplied = 0;
  layers.forEach(k => { sumApplied += appliedWeights[k]; });
  if (sumApplied > 0) {
    layers.forEach(k => { appliedWeights[k] = appliedWeights[k] / sumApplied; });
  } else {
    layers.forEach(k => { appliedWeights[k] = 0.125; });
  }

  // ================= STRICT SAFETY-TRIAGE CIRCUIT =================
  if (routerJson.safety_override) {
    console.warn("Safety override detected by Router AI. Bypassing specialists.");
    try {
      await supabase.from('satiya_router_logs').insert({
        user_id: userId,
        session_id: sessionId,
        context_type: routerJson.context_type,
        safety_override: true,
        confidence_score: routerJson.confidence_score,
        raw_router_weights: routerJson.dynamic_weights,
        applied_weights: appliedWeights
      });
    } catch (dbErr) {
      console.warn("Could not save to satiya_router_logs:", dbErr);
    }
    return {
      safety_override: true,
      layer1: { type: "Emotion", intensity: 1.0, complexity: 1.0, score: 1.0, details: "ระบบตรวจพบภาวะวิกฤตความปลอดภัย" },
      layer2: { type: "Anger", intensity: 1.0, direction: "pushing", score: 0.0, details: "" },
      layer3: { type: "Resignation", intensity: 1.0, agency: "passive", score: 0.0, details: "" },
      layer4: { score: 0.0, details: "" },
      layer5: { consistency: 0.0, evolution_rate: 0.0, trend: "declining", score: 0.0, details: "" },
      layer6: { score: 0.0, details: "" },
      layer7: { score: 0.0, details: "" },
      layer8: { score: 0.0, details: "" },
      delta_report: {
        primary_divergence: "ตรวจพบระดับความเครียดหรือวิกฤตด้านความปลอดภัยสูง",
        ui_reflection_text: "ขณะนี้ระบบตรวจพบว่าคุณอาจกำลังเผชิญสภาวะที่ท้าทายอย่างยิ่ง หากต้องการพูดคุยกับผู้เชี่ยวชาญทันที สามารถโทรติดต่อสายด่วนสุขภาพจิต 1323 ได้ฟรีตลอด 24 ชั่วโมงค่ะ"
      }
    };
  }

  // ================= LAYER 2: SPECIALISTS POOL =================

  // 1. Run Deterministic Specialist Scorer (Regex)
  const lastUserMessage = chatHistory[chatHistory.length - 1]?.content || "";
  const detFeatures = runDeterministicScorer(lastUserMessage);

  // 2. Run Cognitive LLM Scorer (Fallback Chain: Claude 3.5 Sonnet -> GPT-4o -> Gemini 1.5 Pro)
  const cognitiveSystemPrompt = `You are a Psychological Speech Analyzer specializing in the Satiya 8-Layer Personality Framework.
Your job is to read a chat conversation transcript and analyze the user's personality dynamics across 8 dimensions.

Here is the User's Quiz Baseline (starting point):
${baselineInfo}

To perform an accurate temporal weighted analysis, you are also provided with the user's historical chat logs categorized by time:
=== HISTORICAL CHAT LOGS (2-3 MONTHS AGO TO PRESENT) ===
${recentHistoryText}
========================================================

=== OLDER CHAT LOGS (OLDER THAN 3 MONTHS) ===
${olderHistoryText}
=============================================

And here is the transcript of their CURRENT session:
=== CURRENT SESSION TRANSCRIPT ===
${currentSessionTranscript}
==================================

We have computed the following deterministic linguistic features for the user's latest message:
- Swear words frequency (F_swear): ${detFeatures.fSwear}
- Should/obligation words frequency (F_should): ${detFeatures.fShould}
- Support/empathy words frequency (F_support): ${detFeatures.fSupport}
- Apology/sorry words frequency (F_sorry): ${detFeatures.fSorry}

CRITICAL ANALYSIS GUIDELINE (TEMPORAL WEIGHTING):
1. Give the HIGHEST WEIGHT and priority to the user's behavior and statements in the CURRENT SESSION and the RECENT CHAT LOGS (last 2-3 months). Humans can change, evolve, or deteriorate in their traits over time.
2. Compare current/recent behavior with older logs and quiz baseline to capture shifts/consistency.

Evaluate each of the following 8 layers for the user (score range: 0.0 to 1.0):
- Layer 1: Context Type (Ethics, Relationship, Success, Justice, Decision-making, Emotion), Context Intensity (0-1 Lexicon intensity of feeling), Complexity (0-1 depth of situation). Score = (Intensity + Complexity) / 2.
- Layer 2: Reaction to Third-Party (Judgment, Empathy, Encouragement, Anger, Neglect, Support), Intensity (0-1), Direction ("pushing" for negative/distancing or "approaching" for positive/bonding).
  CRITICAL: Measure positive pro-social morality. Empathy, Encouragement, and Support (approaching) should yield high score. Extreme Judgment or Anger (pushing) must result in a lower pro-social morality score (representing hostility bias or moral rigidity).
- Layer 3: Reaction to Situation (Problem-Solving, Avoidance, Acceptance, Confrontation, Compromise, Resignation), Action Intensity (0-1), Agency ("active" or "passive"). Score = Action Intensity based on strength.
- Layer 4: Self-Reflection. Frequency of self-questioning, self-admitting of faults, philosophical questioning. Score = weighted average of these frequencies (0-1).
- Layer 5: Consistency & Evolution. Consistency of answers (0-1) and evolution/learning rate (0-1). Score = (Consistency + Evolution) / 2.
- Layer 6: Meta-Cognition. Frequency of explaining reasons, questioning reasoning methods, describing thought processes. Score = 0-1 based on presence of these patterns.
- Layer 7: Emotional Regulation. Control of anger, acceptance of feelings, expression of feelings. Score = 0-1 based on regulation ability. (High F_swear should lower Layer 7 score).
- Layer 8: Social Dynamics. Frequency of asking others, listening, commanding. Score = 0-1 based on collaborative vs commanding dynamics.

Also compare this Dynamic Profile with the Quiz Baseline and generate a "delta_report":
- "primary_divergence": What is the main difference between their quiz/older profile and actual recent chat behavior? (e.g. "ผู้ใช้แสดงระดับการควบคุมอารมณ์ได้ดียิ่งขึ้นในช่วง 2-3 เดือนนี้ เมื่อเทียบกับแบบทดสอบแรกเริ่ม")
- "ui_reflection_text": A warm, encouraging 1-2 sentence reflection in Thai to display to the user as a mental health insight. DO NOT use clinical diagnostic terms (โรค, ผิดปกติ, บำบัด).

You MUST output ONLY a valid JSON object matching the following structure, with no markdown wrappers, no backticks, and no extra text:
{
  "layer1": { "type": "Ethics|Relationship|Success|Justice|Decision-making|Emotion", "intensity": 0.0, "complexity": 0.0, "score": 0.0, "details": "explanation in Thai" },
  "layer2": { "type": "Judgment|Empathy|Encouragement|Anger|Neglect|Support", "intensity": 0.0, "direction": "pushing|approaching", "score": 0.0, "details": "explanation in Thai" },
  "layer3": { "type": "Problem-Solving|Avoidance|Acceptance|Confrontation|Compromise|Resignation", "intensity": 0.0, "agency": "active|passive", "score": 0.0, "details": "explanation in Thai" },
  "layer4": { "score": 0.0, "details": "explanation in Thai" },
  "layer5": { "consistency": 0.0, "evolution_rate": 0.0, "trend": "stable|improving|declining", "score": 0.0, "details": "explanation in Thai" },
  "layer6": { "score": 0.0, "details": "explanation in Thai" },
  "layer7": { "score": 0.0, "details": "explanation in Thai" },
  "layer8": { "score": 0.0, "details": "explanation in Thai" },
  "delta_report": {
    "primary_divergence": "divergence summary in Thai",
    "ui_reflection_text": "reflection text in Thai"
  }
}`;

  try {
    const cognitiveResponseText = await callGenerativeAIWithFallback(
      cognitiveSystemPrompt,
      'Analyze the transcript and return the JSON analysis.',
      true
    );

    const cleanJsonText = cognitiveResponseText.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    const result: AnalysisOutput = JSON.parse(cleanJsonText);

    // ================= LAYER 3: AGGREGATOR =================
    // Compute final weighted personality score mathematically using appliedWeights
    const finalScore = 
      appliedWeights.w1_context * (result.layer1.score || 0.5) +
      appliedWeights.w2_third_party * (result.layer2.score || 0.5) +
      appliedWeights.w3_situation * (result.layer3.score || 0.5) +
      appliedWeights.w4_self_reflect * (result.layer4.score || 0.5) +
      appliedWeights.w5_consistency * (result.layer5.score || 0.5) +
      appliedWeights.w6_meta_cognition * (result.layer6.score || 0.5) +
      appliedWeights.w7_emo_regulation * (result.layer7.score || 0.5) +
      appliedWeights.w8_social_dynamic * (result.layer8.score || 0.5);

    const roundedScore = Math.round(finalScore * 100) / 100;

    // Fuzzy Quadrant Logic
    const scaledScore = 1.0 + 4.0 * roundedScore; // 1-5 scale
    const confO = Math.min(Math.abs(scaledScore - 3.0) / 0.3, 1.0);
    const inFuzzyZone = confO < 1.0;

    // Save behavioral profile (including applied weights)
    try {
      await supabase.from('satiya_behavioral_profiles').insert({
        user_id: userId,
        session_id: sessionId,
        layer_scores: result,
        full_personality_score: roundedScore,
        delta_report: result.delta_report,
        applied_weights: appliedWeights
      });
    } catch (dbErr) {
      console.warn("Could not save satiya_behavioral_profiles:", dbErr);
    }

    // Save router decision log
    try {
      await supabase.from('satiya_router_logs').insert({
        user_id: userId,
        session_id: sessionId,
        context_type: routerJson.context_type,
        safety_override: false,
        confidence_score: routerJson.confidence_score,
        raw_router_weights: routerJson.dynamic_weights,
        applied_weights: appliedWeights
      });
    } catch (dbErr) {
      console.warn("Could not save satiya_router_logs:", dbErr);
    }

    // Save to router_cognitive_logs
    try {
      const scoresSnapshot = {
        S1: result.layer1.score,
        S2: result.layer2.score,
        S3: result.layer3.score,
        S4: result.layer4.score,
        S5: result.layer5.score,
        S6: result.layer6.score,
        S7: result.layer7.score,
        S8: result.layer8.score,
        moralProfile: detFeatures.moralProfile,
        fuzzy_conf: confO,
        in_fuzzy_zone: inFuzzyZone
      };

      await supabase.from('router_cognitive_logs').insert({
        session_id: sessionId,
        user_id: userId,
        user_message: lastUserMessage,
        context_type: routerJson.context_type,
        chosen_strategy: routerJson.chosen_strategy || "PROGRESSIVE_CLARIFICATION",
        applied_weights: appliedWeights,
        scores_snapshot: scoresSnapshot,
        final_score: scaledScore, // 1-5 scale
        safety_triggered: false
      });
    } catch (dbErr) {
      console.warn("Could not save to router_cognitive_logs:", dbErr);
    }

    return result;
  } catch (e) {
    console.error("Error running 8-layer analyzer MoPE pipeline:", e);
    return null;
  }
}
