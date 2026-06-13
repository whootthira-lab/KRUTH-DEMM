import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { processSatiyaMessage, ChatMessage, ChatState } from '@/lib/satiya_coach_engine';
import { analyzeSpeech8Layers } from '@/lib/satiya_analyzer';


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, message, chatHistory, state } = body as {
      userId: string;
      message: string;
      chatHistory: ChatMessage[];
      state: ChatState;
    };

    if (!userId || !message) {
      return NextResponse.json({ error: 'Missing userId or message' }, { status: 400 });
    }

    // Default state if not provided
    const chatState: ChatState = state || {
      isToxicMode: false,
      currentAqIndex: 0,
      aqAnswers: {}
    };

    // 1. Process message through Satiya AI Coach Engine
    const result = await processSatiyaMessage(userId, message, chatHistory, chatState);

    // 2. Save user message to database (Fallback gracefully if table not created yet)
    try {
      await supabase.from('satiya_chat_logs').insert([
        { user_id: userId, sender: 'user', message: message },
        { user_id: userId, sender: 'assistant', message: result.replyText }
      ]);
    } catch (dbErr) {
      console.warn("Could not save to satiya_chat_logs (perhaps migration is not run yet):", dbErr);
    }

    // 3. Trigger 8-Layer Analysis in the background (Non-blocking)
    const fullHistory = chatHistory
      .map(m => ({ role: m.role, content: m.content }))
      .concat({ role: 'user', content: message }, { role: 'assistant', content: result.replyText });
    
    const userMsgCount = fullHistory.filter(m => m.role === 'user').length;
    if (userMsgCount >= 2) {
      // Run analysis asynchronously so it doesn't block the API response time
      analyzeSpeech8Layers(userId, 'satiya_session', fullHistory).catch(err => {
        console.error("Background 8-layer analysis failed:", err);
      });
    }

    // 4. Return response
    return NextResponse.json({
      ok: true,
      replyText: result.replyText,
      state: result.updatedState,
      options: result.options || []
    });
  } catch (error: any) {
    console.error("Satiya Chat API Error:", error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
