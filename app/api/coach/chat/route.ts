import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { callGenerativeAI } from '@/lib/satiya_coach_engine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      sessionId,
      groupNumber,
      message,
      chatHistory,
      goldDiff = 0,
      gameMinute = 0,
      teamHeroIds = {},
      opponentHeroIds = []
    } = body as {
      sessionId: string;
      groupNumber: number;
      message: string;
      chatHistory: { role: 'user' | 'assistant'; content: string }[];
      goldDiff: number;
      gameMinute: number;
      teamHeroIds: Record<string, string>; // user_id -> hero_id
      opponentHeroIds: string[]; // hero_id[]
    };

    if (!sessionId || groupNumber === undefined || !message) {
      return NextResponse.json({ error: 'Missing sessionId, groupNumber or message' }, { status: 400 });
    }

    // 1. Fetch group members assigned to this session and group number
    const { data: assignments, error: assignErr } = await supabase
      .from('group_assignments')
      .select('user_id')
      .eq('session_id', sessionId)
      .eq('group_number', groupNumber);

    if (assignErr || !assignments || assignments.length === 0) {
      return NextResponse.json({ error: 'No members found in this group assignment' }, { status: 404 });
    }

    const userIds = assignments.map(a => a.user_id);

    // 2. Fetch KWI responses for these users
    const { data: kwiData } = await supabase
      .from('kwi_responses')
      .select('user_id, vitality, meaning, connection, mastery, resilience')
      .in('user_id', userIds);

    // 3. Fetch results for Jungian & Quadrant
    const { data: resultsData } = await supabase
      .from('results')
      .select('user_id, archetype_id, quadrant_primary, jungian_type, archetypes(name_th)')
      .in('user_id', userIds);

    // 4. Fetch users full names
    const { data: usersData } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', userIds);

    // 5. Fetch all RoV heroes metadata
    const { data: heroesData } = await supabase
      .from('rov_knowledge_heroes')
      .select('*');

    const heroMap = new Map((heroesData || []).map(h => [h.id, h]));

    // Construct team members details text
    const membersDetailText = userIds.map((uid, idx) => {
      const user = (usersData || []).find(u => u.id === uid);
      const res = (resultsData || []).find(r => r.user_id === uid);
      const kwi = (kwiData || []).find(k => k.user_id === uid);
      const heroId = teamHeroIds[uid];
      const hero = heroId ? heroMap.get(heroId) : null;

      const name = user?.full_name || `ผู้เล่น ${idx + 1}`;
      const type = res?.jungian_type || 'N/A';
      const quadrant = res?.quadrant_primary || 'N/A';
      const heroName = hero ? `${hero.hero_name_en} (${hero.primary_role})` : 'ยังไม่เลือกฮีโร่';
      const kwiText = kwi 
        ? `KWI [พลังชีวิต:${kwi.vitality}, สายสัมพันธ์:${kwi.connection}, ล้มลุก:${kwi.resilience}]`
        : 'ยังไม่มีสถิติ KWI';

      return `- ${name} | เล่น: ${heroName} | จิตวิทยา: ${type} (กลุ่ม ${quadrant}) | สถิติ: ${kwiText}`;
    }).join('\n');

    // Fetch opponent heroes
    const oppHeroesNames = opponentHeroIds
      .map(id => heroMap.get(id)?.hero_name_en || 'ไม่พบข้อมูล')
      .filter(name => name !== 'ไม่พบข้อมูล')
      .join(', ');

    // Determine stress override state
    const isStateOverride = goldDiff <= -3000;

    // 6. Build the System Prompt
    const systemPrompt = `คุณคือ Elite Esports Cognitive Coach (โค้ชวิเคราะห์ยุทธศาสตร์และจิตวิทยาผู้เล่นในระหว่างการแข่งจริง)
ทำหน้าที่คอยเป็นคู่คิด แนะนำแผนการเดินเกม แก้ดราฟต์ และการเดินระบบแบบเรียลไทม์ให้กับผู้จัดการทีม/โค้ช

สถานการณ์เกมในห้องบัญชาการ Live War Room ณ ปัจจุบัน:
- เวลาในเกม: นาทีที่ ${gameMinute}
- ส่วนต่างการเงิน (Gold Difference): ${goldDiff} ทอง (ฝั่งเรา ${goldDiff >= 0 ? 'นำอยู่' : 'ตามอยู่'} ${Math.abs(goldDiff)} ทอง)
${isStateOverride ? '⚠️ [ระบบเปิดการป้องกันขั้นวิกฤต - State Override]: ทองตามหลังเกิน 3,000 ทอง! บังคับให้ AI แนะนำแนวทาง Defensive Matrix เน้นยื้อ ดึงเกม ยึดพื้นที่ป้องกัน และห้ามปะทะเดี่ยวเด็ดขาด' : '🛡️ [โหมดสถานการณ์ปกติ]: แนะนำกลยุทธ์ตามโครงสร้างเชิงรุกหรือรับที่เหมาะสม'}

👥 สถิติและรายละเอียดสมาชิกนักกีฬาในทีมฝั่งเรา:
${membersDetailText}

⚔️ ฮีโร่ดราฟต์ของฝั่งตรงข้าม:
[${oppHeroesNames || 'ยังไม่มีข้อมูลการเลือกตัวฝั่งศัตรู'}]

บทบาทการตอบกลับของคุณ:
1. ตอบด้วยภาษาไทย สไตล์โค้ด Esports ระดับสูง ที่มีความเป็นผู้นำ เฉียบขาด มีเหตุผล อิงหลักจิตวิทยา และรวดเร็ว
2. แนะนำแนวทางปฏิบัติระยะสั้น (Short-term Actionable Plan) ที่สามารถนำไปใช้บอกนักกีฬาได้ทันทีในเลน (เช่น "ให้แครี่ถอยคุมแนวป้อมใน", "นาครอสพยายามฟาร์มพื้นที่ป่าตรงข้ามเพื่อหลบไฟต์")
3. วิเคราะห์เชื่อมโยงสุขภาวะและจิตวิทยา เช่น หากผู้เล่น KWI ต่ำ หรือเล่นตัวล้วงใต้ภาวะกดดัน ให้สั่งเซฟความปลอดภัยเป็นหลัก
4. ห้ามเกริ่นหรือพูดทฤษฎียาวเหยียด โค้ชต้องการคำตอบสั้นๆ (ไม่เกิน 3-4 ย่อหน้า) เพื่อนำไปสั่งการทันที!`;

    // 7. Call LLM Router
    let replyText = '';
    try {
      replyText = await callGenerativeAI(systemPrompt, chatHistory, message);
    } catch (apiErr: any) {
      console.error('Coach Chat LLM Router Error, using fallback:', apiErr);
      replyText = `สวัสดีครับโค้ช (ขณะนี้ระบบ AI Strategy Gateway ขัดข้องชั่วคราว ขอวิเคราะห์ด้วยระบบอัตโนมัติทดแทนชั่วคราวนะครับ)

🛡️ **วิเคราะห์สถานการณ์เกมสด (นาทีที่ ${gameMinute}):**
* **สเตตัสการเงิน:** ทองฝั่งเรา${goldDiff >= 0 ? 'นำอยู่' : 'ตามอยู่'} ${Math.abs(goldDiff)} ทอง
* ${isStateOverride ? '⚠️ **คำแนะนำวิกฤต (Defensive Matrix):** เงินตามค่อนข้างลึก แนะนำให้ Freeze คลื่นครีปป้อมใน ปักวอร์ดสายตาแนวป่าตนเอง เลี่ยงการปะทะทีมไฟต์แบบ 5v5 และเน้นฟาร์มทรัพยากรปลอดภัยก่อนครับ' : '🚀 **คำแนะนำ:** พยายามกดดันเลนข้างและยึดการคุมมังกร/Dark Slayer ตัวสำคัญเพื่อขยายแต้มต่อการเงินครับ'}

💡 **เป้าหมายด่วน:** บอกนักกีฬาให้ช่วยประคองเลนแครี่ และเน้นการเข้าทำเฉพาะตอนจำนวนคนฝั่งเราเหนือกว่าครับ!`;
    }

    return NextResponse.json({
      ok: true,
      replyText
    });
  } catch (err: any) {
    console.error('Error in coach chat API:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
