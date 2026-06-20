import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calcVoiceVolatility } from '@/lib/scoring';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      session_id,
      group_number,
      user_id,
      game_time_seconds,
      pitch_ratio = 1.0,
      speech_rate = 1.0,
      negative_keyword_density = 0.0,
      last_game_event = 'FARMING'
    } = body;

    if (!session_id || !user_id || group_number === undefined || game_time_seconds === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: session_id, group_number, user_id, game_time_seconds' },
        { status: 400 }
      );
    }

    // 1. Transient memory processing - NO audio file is saved.
    // Any transient audio data in RAM is destroyed immediately (no-op here since we don't store it)

    // 2. Calculate Voice Volatility Index (VVI)
    const vvi = calcVoiceVolatility(
      Number(pitch_ratio),
      Number(speech_rate),
      Number(negative_keyword_density)
    );

    // 3. Map to arousal, valence and predicted emotional state
    // Higher pitch ratio and speech rate generally mean higher arousal.
    // High negative keyword density indicates negative valence.
    let arousal = Math.min(1.0, Math.max(0.0, (Number(pitch_ratio) + Number(speech_rate) - 1.0) / 2.0));
    let valence = Math.min(1.0, Math.max(0.0, 1.0 - Number(negative_keyword_density)));

    let predictedState = 'CALM';
    if (vvi >= 3.5) {
      predictedState = 'TILT';
    } else if (arousal >= 0.7 && valence >= 0.6) {
      predictedState = 'HYPE';
    } else if (arousal < 0.4 && valence < 0.4) {
      predictedState = 'DEJECTED';
    }

    // 4. Save statistics to Supabase time-series log
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('member_emotional_time_series')
      .insert({
        session_id,
        group_number: Number(group_number),
        user_id,
        game_time_seconds: Number(game_time_seconds),
        arousal_score: Number(arousal.toFixed(2)),
        valence_score: Number(valence.toFixed(2)),
        vvi_volatility: Number(vvi.toFixed(2)),
        predicted_state: predictedState,
        last_game_event
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 5. Generate AI recommended macro strategy based on player state
    let recommendedMacro = 'KEEP_STEADY';
    let macroLabel = 'ประคองจังหวะ';
    let macroAdvice = 'สภาวะอารมณ์ปกติ รักษาแผนดราฟต์และระดับฟาร์มปกติ';

    if (predictedState === 'TILT') {
      recommendedMacro = 'CALL_TIMEOUT_BREATHE';
      macroLabel = 'ดึงจังหวะช้า / หายใจลึก';
      macroAdvice = 'ผู้เล่นส่งสัญญาณความเครียดสูงพุ่งเป้าขัดแย้ง แนะนำส่งคำสั่งดึงเกมช้า ปลอบโยนสร้างความใจเย็น';
    } else if (predictedState === 'HYPE') {
      recommendedMacro = 'INITIATE_FIGHT';
      macroLabel = 'โหมบุก / บังคับไฟต์';
      macroAdvice = 'ทีมกำลังคึกคักและมีความตื่นตัวสูงมาก จังหวะทองเปิดเกมบุกเข้าชนหรือยึดเป้าหมายมังกร/คอง';
    } else if (predictedState === 'DEJECTED') {
      recommendedMacro = 'STABILIZE_DEFENSE';
      macroLabel = 'ตั้งรับเซฟ / เซฟเพื่อน';
      macroAdvice = 'สัญญาณท้อถอย ขาดการสื่อสารในทีม แนะนำปรับยุทธศาสตร์เน้นตั้งรับเซฟป้อม และหลีกเลี่ยงการเปิดไฟต์เดี่ยว';
    }

    return NextResponse.json({
      success: true,
      data: {
        vvi,
        predictedState,
        arousal,
        valence,
        recommendedMacro,
        macroLabel,
        macroAdvice
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
