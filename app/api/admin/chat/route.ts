import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orgId, message, chatHistory } = body as {
      orgId: string;
      message: string;
      chatHistory: { role: 'user' | 'assistant'; content: string }[];
    };

    if (!orgId || !message) {
      return NextResponse.json({ error: 'Missing orgId or message' }, { status: 400 });
    }

    // 1. Verify organization exists
    const { data: orgData } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single();

    if (!orgData) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // 2. Fetch all members in this organization
    const { data: members } = await supabase
      .from('org_members')
      .select('user_id')
      .eq('org_id', orgId);

    const userIds = (members || []).map(m => m.user_id);

    // Default statistics if no users have completed tests yet
    let totalMembers = userIds.length;
    let avgVitality = 3.0;
    let avgMeaning = 3.0;
    let avgConnection = 3.0;
    let avgMastery = 3.0;
    let avgResilience = 3.0;
    let topArchetype = 'ยังไม่มีข้อมูล';
    let quadDistribution: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };

    if (userIds.length > 0) {
      // 3. Fetch KWI results for these users
      const { data: kwiData } = await supabase
        .from('kwi_responses')
        .select('vitality, meaning, connection, mastery, resilience')
        .in('user_id', userIds);

      if (kwiData && kwiData.length > 0) {
        const sum = kwiData.reduce((acc, curr) => ({
          v: acc.v + (curr.vitality || 0),
          m: acc.m + (curr.meaning || 0),
          c: acc.c + (curr.connection || 0),
          a: acc.a + (curr.mastery || 0),
          r: acc.r + (curr.resilience || 0),
        }), { v: 0, m: 0, c: 0, a: 0, r: 0 });

        avgVitality = Math.round((sum.v / kwiData.length) * 10) / 10;
        avgMeaning = Math.round((sum.m / kwiData.length) * 10) / 10;
        avgConnection = Math.round((sum.c / kwiData.length) * 10) / 10;
        avgMastery = Math.round((sum.a / kwiData.length) * 10) / 10;
        avgResilience = Math.round((sum.r / kwiData.length) * 10) / 10;
      }

      // 4. Fetch Archetype & Quadrant distribution
      const { data: resultsData } = await supabase
        .from('results')
        .select('archetype_id, quadrant_primary, archetypes(name_th)')
        .in('user_id', userIds);

      if (resultsData && resultsData.length > 0) {
        const archCounts: Record<string, number> = {};
        resultsData.forEach(r => {
          const name = (Array.isArray(r.archetypes) ? (r.archetypes[0] as any)?.name_th : (r.archetypes as any)?.name_th) || r.archetype_id || 'Unknown';
          archCounts[name] = (archCounts[name] || 0) + 1;

          if (r.quadrant_primary && r.quadrant_primary in quadDistribution) {
            quadDistribution[r.quadrant_primary]++;
          }
        });

        // Find the top archetype
        const sorted = Object.entries(archCounts).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) {
          topArchetype = `${sorted[0][0]} (${sorted[0][1]} คน)`;
        }
      }
    }

    // 5. Construct System Prompt
    const systemPrompt = `คุณคือ Executive AI Coach (ที่ปรึกษาการจัดการระดับบริหารและทรัพยากรบุคคล)
ทำหน้าที่ให้คำปรึกษาแก่ผู้บริหารขององค์กร: "${orgData.name}"

นี่คือสถิติสุขภาวะและการจัดกลุ่มบุคลิกภาพรวมแบบ "ไม่ระบุตัวตน" ของพนักงานทั้งหมดในองค์กร ณ ปัจจุบัน:
- ยอดจำนวนสมาชิกประเมินแล้ว: ${totalMembers} คน
- มิติพลังชีวิตเฉลี่ย (Vitality Score): ${avgVitality}/5
- มิติความหมายชีวิตเฉลี่ย (Meaning Score): ${avgMeaning}/5
- มิติสายสัมพันธ์ความสัมพันธ์เฉลี่ย (Connection Score): ${avgConnection}/5
- มิติการเติบโตความเชี่ยวชาญเฉลี่ย (Mastery Score): ${avgMastery}/5
- มิติความยืดหยุ่นล้มแล้วลุกเฉลี่ย (Resilience Score): ${avgResilience}/5
- บุคลิกภาพที่พบบ่อยที่สุด (Top Archetype): ${topArchetype}
- การกระจายกลุ่ม Quadrants: 
  * Q1 (นักสำรวจ): ${quadDistribution.Q1} คน
  * Q2 (นักคิด): ${quadDistribution.Q2} คน
  * Q3 (ผู้ประสาน): ${quadDistribution.Q3} คน
  * Q4 (ผู้สร้างสรรค์): ${quadDistribution.Q4} คน

กฎการสนทนาสำหรับ Executive Coach:
1. ห้ามเจาะลึกวิเคราะห์หรือแสดงคะแนนของพนักงาน "รายคน" เด็ดขาด เพื่อเคารพความเป็นส่วนตัวของผู้ใช้ (PDPA & Psychological Ethics)
2. เสนอไอเดียจัดกิจกรรมทีมสัมพันธ์ (Team Building) หรือ นโยบายส่งเสริมองค์กร (HR Policy) ที่สอดคล้องกับมิติที่พนักงานมีคะแนนเฉลี่ยต่ำที่สุด
   - เช่น หาก Vitality ต่ำ -> แนะนำวิธีจัดสรรภาระงาน หรือกิจกรรมพักผ่อนทางจิตใจ
   - หาก Connection ต่ำ -> แนะนำกิจกรรมกระชับสัมพันธ์และการเปิดใจร่วมกันในองค์กร
3. ให้คำแนะนำโดยใช้หลักการจิตวิทยาการบริหารงานบุคคลอย่างนุ่มนวล มีความเป็นมืออาชีพ น่าเชื่อถือ และให้กำลังใจผู้บริหาร
4. ห้ามใช้คำวินิจฉัยโรคเชิงคลินิก
5. สนทนาด้วยภาษาไทยที่สุภาพ เข้าใจง่าย และให้แนวทางปฏิบัติที่ผู้บริหารสามารถนำไปปรับใช้ได้จริงทันที`;

    // 6. Request to Anthropic Claude
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1200,
      system: systemPrompt,
      messages: chatHistory.map(m => ({ role: m.role, content: m.content })).concat({ role: 'user', content: message }),
    });

    const replyText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('');

    return NextResponse.json({
      ok: true,
      replyText,
      options: [
        'เสนอแผนพัฒนาพลังชีวิตพนักงานด่วน',
        'วิเคราะห์ความเข้ากันได้ของพนักงาน Q1 และ Q4',
        'ขอไอเดียจัดกิจกรรมสร้างความสัมพันธ์ในโรงเรียน',
        'ขอบคุณมากสำหรับคำแนะนำ'
      ]
    });
  } catch (error: any) {
    console.error('Executive Chat API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
