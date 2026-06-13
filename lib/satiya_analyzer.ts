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

  // Format current session chat history into text for Claude
  const currentSessionTranscript = chatHistory
    .map(m => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`)
    .join('\n');

  // 2. Construct Prompt for Claude
  const systemPrompt = `You are a Psychological Speech Analyzer specializing in the Satiya 8-Layer Personality Framework.
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

CRITICAL ANALYSIS GUIDELINE (TEMPORAL WEIGHTING):
1. Give the HIGHEST WEIGHT and priority to the user's behavior and statements in the CURRENT SESSION and the RECENT CHAT LOGS (last 2-3 months). Humans can change, evolve, or deteriorate in their behavioral traits and coping styles over time.
2. Compare the recent/current behavior with the OLDER CHAT LOGS and the QUIZ BASELINE:
   - If their coping style and personality layers in the current/recent logs are highly aligned with the older ones, it indicates high consistency and that their core traits/habits remain unchanged.
   - If there is divergence (e.g. they express anger more passively now, or show better emotional regulation than their baseline/older records), highlight this shift in "layer5" (Consistency & Evolution) and the "delta_report".

Evaluate each of the following 8 layers for the user (score range: 0.0 to 1.0):
- Layer 1: Context Type (Ethics, Relationship, Success, Justice, Decision-making, Emotion), Context Intensity (0-1 Lexicon intensity of feeling), Complexity (0-1 depth of situation). Score = (Intensity + Complexity) / 2.
- Layer 2: Reaction to Third-Party (Judgment, Empathy, Encouragement, Anger, Neglect, Support), Intensity (0-1), Direction ("pushing" for negative/distancing or "approaching" for positive/bonding). Score = Intensity score based on reaction strength.
- Layer 3: Reaction to Situation (Problem-Solving, Avoidance, Acceptance, Confrontation, Compromise, Resignation), Action Intensity (0-1), Agency ("active" or "passive"). Score = Action Intensity based on strength.
- Layer 4: Self-Reflection. Frequency of self-questioning, self-admitting of faults, philosophical questioning. Score = weighted average of these frequencies (0-1).
- Layer 5: Consistency & Evolution. Consistency of answers (0-1) and evolution/learning rate (0-1). Score = (Consistency + Evolution) / 2.
- Layer 6: Meta-Cognition. Frequency of explaining reasons, questioning reasoning methods, describing thought processes. Score = 0-1 based on presence of these patterns.
- Layer 7: Emotional Regulation. Control of anger, acceptance of feelings, expression of feelings. Score = 0-1 based on regulation ability.
- Layer 8: Social Dynamics. Frequency of asking others, listening, commanding. Score = 0-1 based on collaborative vs commanding dynamics.

Also compare this Dynamic Profile with the Quiz Baseline and generate a "delta_report":
- "primary_divergence": What is the main difference between their quiz/older profile and actual recent chat behavior? (e.g. "ผู้ใช้แสดงระดับการควบคุมอารมณ์ได้ดียิ่งขึ้นในช่วง 2-3 เดือนนี้ เมื่อเทียบกับแบบทดสอบแรกเริ่ม")
- "ui_reflection_text": A warm, encouraging 1-2 sentence reflection in Thai to display to the user as a mental health insight (e.g. "จากการพูดคุยล่าสุดในช่วงนี้ สังเกตว่าคุณแสดงความยืดหยุ่นทางอารมณ์และการยอมรับสภาวะจริงได้ดีกว่าในอดีต ถือเป็นพัฒนาการเชิงบวกที่น่าชื่นชมมากค่ะ"). DO NOT use clinical diagnostic terms (โรค, ผิดปกติ, บำบัด).

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
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Analyze the transcript and return the JSON analysis.' }],
    });

    const replyText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('')
      .trim();

    // Clean up markdown code blocks if Claude adds them
    const cleanJsonText = replyText.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    const result: AnalysisOutput = JSON.parse(cleanJsonText);

    // 3. Compute final weighted personality score mathematically
    // Weights: Layer1=0.15, Layer2=0.15, Layer3=0.10, Layer4=0.15, Layer5=0.10, Layer6=0.15, Layer7=0.10, Layer8=0.10
    const w = [0.15, 0.15, 0.10, 0.15, 0.10, 0.15, 0.10, 0.10];
    const finalScore = 
      w[0] * (result.layer1.score || 0.5) +
      w[1] * (result.layer2.score || 0.5) +
      w[2] * (result.layer3.score || 0.5) +
      w[3] * (result.layer4.score || 0.5) +
      w[4] * (result.layer5.score || 0.5) +
      w[5] * (result.layer6.score || 0.5) +
      w[6] * (result.layer7.score || 0.5) +
      w[7] * (result.layer8.score || 0.5);

    const roundedScore = Math.round(finalScore * 100) / 100;

    // 4. Save to Database (Silent write, gracefully fallback if migration not run yet)
    try {
      await supabase.from('satiya_behavioral_profiles').insert({
        user_id: userId,
        session_id: sessionId,
        layer_scores: result,
        full_personality_score: roundedScore,
        delta_report: result.delta_report
      });
    } catch (dbErr) {
      console.warn("Could not save satiya_behavioral_profiles:", dbErr);
    }

    return result;
  } catch (e) {
    console.error("Error running 8-layer analyzer:", e);
    return null;
  }
}
