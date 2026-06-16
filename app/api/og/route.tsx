import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

// Cache font buffer in global memory to optimize subsequent warm-start requests
let cachedFontData: ArrayBuffer | null = null;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const mode = req.nextUrl.searchParams.get('mode'); // 'download' สำหรับรูปแนวตั้ง
  if (!id) return new Response('id required', { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  // ดึงข้อมูลผลลัพธ์
  const { data: resultRows } = await supabase
    .from('results').select('*').eq('user_id', id)
    .order('created_at', { ascending: false }).limit(1);
  const result = resultRows?.[0];

  if (!result) return new Response('not found', { status: 404 });

  // ดึงข้อมูล Archetype
  const { data: archRows } = await supabase
    .from('archetypes').select('*').eq('id', result.archetype_id).limit(1);
  const arch = archRows?.[0];

  // ดึงข้อมูล User เพื่อเอาสัดส่วนธาตุจากชื่อ
  const { data: userRows } = await supabase
    .from('users').select('*').eq('id', id).limit(1);
  const u = userRows?.[0] || {};

  const a = arch || { name_th: 'KRUTH DEMM', name_en: '', color_hex: '#1A3A5C', via_virtue: '', short_desc: '', long_desc: '' };
  const color = a.color_hex || '#1A3A5C';
  const bright = result.bright_flag;

  // 🚨 เพิ่มระบบ Mapping แปลง Q1-Q4 เป็นชื่อภาษาไทย
  const quadrantThaiNames: Record<string, string> = {
    'Q1': 'กลุ่มนักสำรวจบุกเบิก',
    'Q2': 'กลุ่มนักคิดนักกลยุทธ์',
    'Q3': 'กลุ่มผู้ประสานเชื่อมโยง',
    'Q4': 'กลุ่มผู้สร้างสรรค์'
  };
  const displayQuadrant = result.quadrant_primary ? (quadrantThaiNames[result.quadrant_primary] || result.quadrant_primary) : '';

  const isDownload = mode === 'download';
  const width = 1200;
  const height = isDownload ? 1400 : 630;

  // โหลดฟอนต์ภาษาไทยจาก CDN 
  if (!cachedFontData) {
    const fontUrl = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansThai/NotoSansThai-Medium.ttf';
    cachedFontData = await fetch(new URL(fontUrl)).then((res) => res.arrayBuffer());
  }

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        backgroundColor: '#F4F7F9',
        backgroundImage: 'linear-gradient(to bottom right, #F4F7F9, #E2E8F0)', 
        fontFamily: '"NotoSansThai"',
        padding: isDownload ? 40 : 32,
      }}>
        {/* ═══ Header Banner ═══ */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          backgroundColor: '#1A3A5C', 
          borderRadius: 20,
          padding: '16px 40px',
          marginBottom: 20,
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
          width: '100%'
        }}>
          <span style={{ fontSize: isDownload ? 64 : 52, fontWeight: 900, color: '#FFFFFF', letterSpacing: '2px' }}>
            🦅 แบบทดสอบบุคลิกภาพ KRUTH DEMM
          </span>
        </div>

        {/* ═══ Main Content ═══ */}
        <div style={{ display: 'flex', flex: 1, gap: 28 }}>
          
          {/* LEFT: การ์ด Archetype */}
          <div style={{ display: 'flex', flexDirection: 'column', width: isDownload ? 480 : 360 }}>
            <div style={{
              width: isDownload ? 480 : 360, height: isDownload ? 640 : 460,
              borderRadius: 24, backgroundColor: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', border: '6px solid #fff'
            }}>
              {a.image_url
                ? <img src={a.image_url} width={isDownload ? 480 : 360} height={isDownload ? 640 : 460} style={{ objectFit: 'cover' }} />
                : <span style={{ fontSize: 100, color: '#fff' }}>🦅</span>
              }
            </div>
            {bright && bright !== '⚗️' && (
              <div style={{
                marginTop: 10, padding: '6px 20px', borderRadius: 20,
                backgroundColor: '#FFF8E1', fontSize: 16, fontWeight: 700, color: '#F57F17',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                {bright} ศักยภาพแฝง
              </div>
            )}
          </div>

          {/* RIGHT: ข้อมูลรายละเอียด */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 12 }}>
            
            {/* 1. ดึงชื่อไทย, ชื่ออังกฤษ, และ Tags มารวมในบรรทัดเดียวกัน */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontSize: isDownload ? 42 : 36, fontWeight: 900, color, lineHeight: 1.1 }}>
                {a.name_th}
              </span>
              <span style={{ fontSize: isDownload ? 22 : 16, color: '#64748B', fontWeight: 700 }}>
                {a.name_en}
              </span>
              <span style={{ padding: '4px 12px', borderRadius: 20, backgroundColor: color, color: '#fff', fontSize: 13, fontWeight: 700 }}>
                ✦ {a.via_virtue}
              </span>
              <span style={{ padding: '4px 12px', borderRadius: 20, backgroundColor: '#1E293B', color: '#fff', fontSize: 13, fontWeight: 700 }}>
                {displayQuadrant} {/* 🚨 เปลี่ยนตรงนี้ให้ดึงภาษาไทยมาแสดงแทน */}
              </span>
            </div>

            {/* Long Desc */}
            <div style={{
              fontSize: isDownload ? 22 : 17, 
              fontWeight: 700, 
              color: '#334155', lineHeight: 1.5,
              padding: '12px 16px', backgroundColor: '#fff', borderRadius: 16,
              border: '1px solid #E2E8F0', flex: 1, 
              display: 'flex', flexDirection: 'column', overflow: 'hidden'
            }}>
              {(isDownload ? a.long_desc : (a.long_desc || a.short_desc || '')).substring(0, 240) + '...'}
            </div>

            {/* ═══ 2. ธาตุจากชื่อและนามสกุล ═══ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* แบนเนอร์หัวข้อธาตุ */}
              <div style={{ 
                display: 'flex', 
                backgroundColor: '#1E293B', 
                borderRadius: 12, 
                padding: '8px 20px', 
                justifyContent: 'center', 
                alignItems: 'center' 
              }}>
                <span style={{ fontSize: isDownload ? 36 : 28, fontWeight: 900, color: '#FFFFFF' }}>
                  ส่วนประกอบธาตุจากชื่อและนามสกุล
                </span>
              </div>

              {/* ตารางแสดงธาตุ 4 อย่าง */}
              <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                {[
                  { e: '🔥', l: 'ไฟ', v: u.name_fire_pct ?? 0, bg: '#FFF7ED', border: '#FFEDD5', color: '#C2410C' },
                  { e: '🌍', l: 'ดิน', v: u.name_earth_pct ?? 0, bg: '#F4F4F5', border: '#E4E4E7', color: '#3F3F46' },
                  { e: '💨', l: 'ลม', v: u.name_wind_pct ?? 0, bg: '#F0FDF4', border: '#DCFCE7', color: '#15803D' },
                  { e: '💧', l: 'น้ำ', v: u.name_water_pct ?? 0, bg: '#EFF6FF', border: '#DBEAFE', color: '#1D4ED8' }
                ].map((d, idx) => (
                  <div key={idx} style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: d.bg, border: `1px solid ${d.border}`, borderRadius: 12, padding: '8px',
                  }}>
                    <span style={{ fontSize: 24, marginBottom: 2 }}>{d.e}</span>
                    <span style={{ fontSize: 13, color: '#64748B', fontWeight: 700 }}>{d.l}</span>
                    <span style={{ fontSize: 18, fontWeight: 900, color: d.color }}>{d.v}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Footer CTA ═══ */}
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          marginTop: 16, padding: '14px 24px',
          backgroundColor: '#0F172A', borderRadius: 16, color: '#F8FAFC', 
          fontSize: isDownload ? 28 : 22, fontWeight: 900,
        }}>
          ✨ แล้วบุคลิกภาพของคุณเป็นแบบไหน? มาลองทำแบบทดสอบกัน → kruthdemm.com
        </div>
      </div>
    ),
    { 
      width, 
      height,
      fonts: [{ name: 'NotoSansThai', data: cachedFontData!, style: 'normal' }]
    }
  );
}