import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { processSatiyaMessage, ChatMessage, ChatState } from '@/lib/satiya_coach_engine';
import { analyzeSpeech8Layers } from '@/lib/satiya_analyzer';

// Crisis keyword check function matching the primary Satiya chatbot API
function evaluateCrisisKeywords(message: string): boolean {
  const crisisTokens = [
    "อยากตาย", "ไม่อยากอยู่แล้ว", "ทำร้ายตัวเอง", "ฆ่าตัวตาย", "ลาโลก",
    "กินยาตาย", "โดดตึก", "ทรมานจนไม่อยากหายใจ", "จบชีวิต"
  ];
  return crisisTokens.some(token => message.includes(token));
}

// LINE message reply helper using direct Fetch to keep things lightweight
async function sendLineReply(replyToken: string, text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  if (!token) {
    console.warn("[LINE Webhook] LINE_CHANNEL_ACCESS_TOKEN is not configured. Reply skipped.");
    return;
  }

  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [
        {
          type: 'text',
          text: text
        }
      ]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[LINE Webhook] LINE Reply API Error:", errText);
    throw new Error(`LINE API returned status ${res.status}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
    const rawBody = await req.text();

    // 1. Signature Verification (Only if LINE_CHANNEL_SECRET is configured)
    if (channelSecret) {
      const signature = crypto
        .createHmac('SHA256', channelSecret)
        .update(rawBody)
        .digest('base64');
      const headerSignature = req.headers.get('x-line-signature') || '';

      if (signature !== headerSignature) {
        console.error("[LINE Webhook] Signature verification failed.");
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else {
      console.warn("[LINE Webhook] LINE_CHANNEL_SECRET is not set. Signature verification bypassed.");
    }

    const payload = JSON.parse(rawBody);
    const events = payload.events || [];

    for (const event of events) {
      // We only process message events from users with type text
      if (event.type !== 'message' || event.message?.type !== 'text') {
        continue;
      }

      const replyToken = event.replyToken;
      const lineUserId = event.source?.userId;
      const messageText = (event.message?.text || '').trim();

      if (!lineUserId || !replyToken) {
        continue;
      }

      // 2. Check for assessment linking command
      // Format 1: "สวัสดีค่ะโค้ชซาติยะ เชื่อมต่อผลประเมินรหัส UUID ของฉัน"
      // Format 2: "เชื่อมต่อผลประเมินรหัส UUID"
      // Format 3: Raw UUID
      const uuidMatch = messageText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

      if (uuidMatch) {
        const targetUserId = uuidMatch[0];
        console.log(`[LINE Webhook] Attempting link request for user_id: ${targetUserId} with LINE ID: ${lineUserId}`);

        // Query if this user exists in the db
        const { data: user, error: userErr } = await supabase
          .from('users')
          .select('id, full_name')
          .eq('id', targetUserId)
          .maybeSingle();

        if (userErr || !user) {
          await sendLineReply(
            replyToken,
            `ขออภัยด้วยนะคะ โค้ชไม่พบรหัสผู้ใช้งาน ${targetUserId} ในระบบหลัก กรุณาตรวจสอบรหัสของท่านอีกครั้ง หรือเลือกคลิกเชื่อมต่อจากหน้ารายงานผลโดยตรงนะคะ 🤍`
          );
          continue;
        }

        // Link the LINE user ID to this user
        const { error: updateErr } = await supabase
          .from('users')
          .update({ line_user_id: lineUserId })
          .eq('id', user.id);

        if (updateErr) {
          console.error("[LINE Webhook] Failed to update line_user_id:", updateErr.message);
          await sendLineReply(
            replyToken,
            `ขออภัยค่ะ ระบบพยายามเชื่อมต่อแต่ล้มเหลว โปรดลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบนะคะ 🤍`
          );
          continue;
        }

        // Retrieve user archetype information to welcome them nicely
        const { data: resultData } = await supabase
          .from('results')
          .select('archetype_name_th')
          .eq('user_id', user.id)
          .maybeSingle();

        const archetypeName = resultData?.archetype_name_th || 'วิเคราะห์จิตวิทยา';
        await sendLineReply(
          replyToken,
          `เชื่อมต่อผลประเมินสำเร็จแล้วค่ะ คุณ ${user.full_name || 'ผู้รับการประเมิน'}! ✨\n\nยินดีที่ได้ร่วมทางดูแลสุขภาวะใจของคุณนะคะ โค้ชซาติยะได้รับข้อมูลบุคลิกภาพ (Archetype: ${archetypeName}) ของคุณเรียบร้อยแล้วค่ะ\n\nต่อจากนี้ คุณสามารถพิมพ์เล่าเรื่องราว ปรึกษาปัญหาสุขภาพจิต หรือพูดคุยทั่วไปกับฉันผ่านทางช่องทาง LINE นี้ได้ทันทีเลยนะคะ 🧘‍♀️🤍`
        );
        continue;
      }

      // 3. Regular Chat Mode (Check if user is already linked)
      const { data: user, error: uErr } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('line_user_id', lineUserId)
        .maybeSingle();

      if (uErr || !user) {
        // Unlinked user - prompt them to link first
        await sendLineReply(
          replyToken,
          `สวัสดีค่ะ ฉันคือโค้ชซาติยะ AI Wellbeing Coach ส่วนตัวของคุณค่ะ 🧘‍♀️✨\n\nยินดีที่ได้รู้จักนะคะ! เนื่องจากบัญชี LINE ของคุณยังไม่ได้รับการเชื่อมโยงกับผลประเมินสุขภาวะในระบบ\n\nรบกวนคุณทำแบบทดสอบให้เสร็จสิ้นก่อน และคลิกปุ่ม "เชื่อมต่อ LINE OA" บนหน้าผลลัพธ์เพื่อเริ่มปรึกษากันนะคะ 🤍\n\nหรือหากคุณมีรหัสผู้ใช้งานแล้ว โปรดพิมพ์ข้อความ "เชื่อมต่อผลประเมินรหัส [รหัสผู้ใช้ของคุณ]" เพื่อเริ่มต้นได้เลยค่ะ`
        );
        continue;
      }

      const userId = user.id;

      // 4. Crisis Keywords Check
      if (evaluateCrisisKeywords(messageText)) {
        const crisisReply = "ผม/ฉันรับรู้ได้เลยนะครับว่าสิ่งที่เธอ/คุณกำลังเผชิญอยู่ตรงหน้ามันหนักหนาและเหนื่อยล้าจนแทบไม่ไหวแล้ว... ในพื้นที่ตรงนี้ อยากชวนมาพักวางใจลงก่อนนะ ร่างกายและจิตใจอาจกำลังส่งสัญญาณว่าต้องการคนรับฟังที่เชี่ยวชาญ ลองโทรคุยกับพี่ๆ ผู้เชี่ยวชาญที่สายด่วนสุขภาพจิต 1323 ดูไหมครับ โทรฟรีตลอด 24 ชั่วโมง มีคนที่พร้อมโอบอุ้ม ปลอดภัย และอยู่ข้างๆ เธอเสมอนะครับ 🤍";
        
        try {
          await supabase.from('satiya_chat_logs').insert([
            { user_id: userId, sender: 'user', message: messageText },
            { user_id: userId, sender: 'assistant', message: crisisReply }
          ]);

          // Update chat state to emergency mode
          const emergencyState = {
            isToxicMode: false,
            currentAqIndex: 0,
            aqAnswers: {},
            safetyTriggered: true,
            currentGoal: "EMERGENCY_SAFE_MODE"
          };
          await supabase.from('satiya_chat_states').upsert({
            user_id: userId,
            state: emergencyState,
            updated_at: new Date().toISOString()
          });
        } catch (dbErr) { /* ignore */ }

        await sendLineReply(replyToken, crisisReply);
        continue;
      }

      // 5. Fetch Satiya Conversation Context
      // Retrieve the last 10 messages from chat history
      const { data: dbLogs } = await supabase
        .from('satiya_chat_logs')
        .select('sender, message')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(10);

      const chatHistory: ChatMessage[] = (dbLogs || []).map(log => ({
        role: log.sender as 'user' | 'assistant',
        content: log.message
      }));

      // Retrieve chat state
      const { data: stateRecord } = await supabase
        .from('satiya_chat_states')
        .select('state')
        .eq('user_id', userId)
        .maybeSingle();

      const state: ChatState = (stateRecord?.state as any) || {
        isToxicMode: false,
        currentAqIndex: 0,
        aqAnswers: {}
      };

      // 6. Process message via AI Coach engine
      const result = await processSatiyaMessage(userId, messageText, chatHistory, state);

      // 7. Save conversation logs & state to Supabase
      try {
        await supabase.from('satiya_chat_logs').insert([
          { user_id: userId, sender: 'user', message: messageText },
          { user_id: userId, sender: 'assistant', message: result.replyText }
        ]);

        await supabase.from('satiya_chat_states').upsert({
          user_id: userId,
          state: result.updatedState,
          updated_at: new Date().toISOString()
        });
      } catch (dbErr) {
        console.error("[LINE Webhook] Failed to save chat logs/state:", dbErr);
      }

      // 8. Send reply back to LINE
      await sendLineReply(replyToken, result.replyText);

      // 9. Trigger background 8-layer analyzer
      const fullHistory = chatHistory
        .concat({ role: 'user', content: messageText }, { role: 'assistant', content: result.replyText });
      
      const userMsgCount = fullHistory.filter(m => m.role === 'user').length;
      if (userMsgCount >= 2) {
        analyzeSpeech8Layers(userId, 'line_session', fullHistory).catch(err => {
          console.error("[LINE Webhook] Background 8-layer analysis failed:", err);
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[LINE Webhook] API Route Exception:", error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
