'use client';
import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase, trackEvent, trackPageView } from '@/lib/supabase';
// 🚨 นำเข้าแพ็กเกจสำหรับวาดกราฟใยแมงมุม
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

function ResultPageInner() {
  const { id } = useParams();
  const sp = useSearchParams();
  const isShared = !!sp.get('ref');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCompat, setShowCompat] = useState(false);
  const [shareSuccess, setShareSuccess] = useState('');

  useEffect(() => { trackPageView(`/result/${id}`); loadResult(); }, [id]);

  async function loadResult() {
    const { data } = await supabase.from('results').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(1).single();
    if (!data) { setLoading(false); return; }
    const { data: arch } = await supabase.from('archetypes').select('*').eq('id', data.archetype_id).single();
    const { data: user } = await supabase.from('users').select('*').eq('id', id).single();
    setResult({ ...data, arch: arch || null, user: user || null });
    setLoading(false);
    trackEvent('result_viewed', 'result', { archetype_id: data.archetype_id });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kruth-demm-final.vercel.app';
  const shareUrl = (src: string) => `${appUrl}/result/${id}?ref=${id}&src=${src}`;

  function shareText() {
    if (!result?.arch) return '';
    const a = result.arch;
    let t = `🦅 KRUTH DEMM — ค้นหาตัวตน\n\nฉันเป็น: ${a.name_th} (${a.name_en})\n✦ ${a.via_virtue} | ${a.quadrant}`;
    if (a.strength_1) t += `\n\n💪 ${[a.strength_1, a.strength_2, a.strength_3].filter(Boolean).join(', ')}`;
    if (a.career_hint) t += `\n💼 ${a.career_hint.substring(0, 60)}`;
    const top3 = result.compat_top3 || [];
    if (top3.length) t += `\n\n💫 เข้ากันดีกับ: ${top3.map((c: any) => c.name_th).join(', ')}`;
    t += '\n\n🔗 มาทำแบบทดสอบกัน!';
    return t;
  }

  async function doShare(platform: string) {
    const url = shareUrl(platform);
    trackEvent('share_clicked', 'sharing', { platform, archetype: result?.archetype_id });
    await supabase.from('share_events').insert({ user_id: String(id), platform, share_type: 'result', archetype_id: result?.archetype_id, share_url: url, og_image_url: `${appUrl}/api/og?id=${id}` });
    const text = encodeURIComponent(shareText());
    const encodedUrl = encodeURIComponent(url);

    if (platform === 'facebook') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${text}`, '_blank');
    } else if (platform === 'line') {
      window.open(`https://social-plugins.line.me/lineit/share?url=${encodedUrl}&text=${text}`, '_blank');
    } else if (platform === 'native') {
      // 📱 ระบบแชร์ของมือถือ
      if (navigator.share) {
        try {
          await navigator.share({ title: 'KRUTH DEMM', text: shareText(), url: url });
        } catch (err) { console.log('User cancelled share'); }
      } else {
        await navigator.clipboard?.writeText(shareText() + '\n\n' + url);
        setShareSuccess('✅ คัดลอกลิงก์แล้ว! นำไปโพสต์ได้เลย');
        setTimeout(() => setShareSuccess(''), 3000);
      }
    } else if (platform === 'download') {
      // 📥 โหลดรูปภาพแนวตั้งแบบรอให้เสร็จ 100% (ป้องกันไฟล์เสีย)
      setShareSuccess('⏳ กำลังวาดรูปภาพ กรุณารอสักครู่...');
      try {
        const response = await fetch(`/api/og?id=${id}&mode=download`);
        if (!response.ok) throw new Error('Failed to generate image');
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `KRUTH_DEMM_${result.arch?.name_en || 'Result'}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        setShareSuccess('📸 โหลดรูปลงเครื่องสำเร็จ! นำไปลงสตอรี่ได้เลย');
      } catch (error) {
        console.error('Download error:', error);
        setShareSuccess('❌ ขออภัย ดึงรูปไม่สำเร็จ กรุณาลองใหม่');
      }
      setTimeout(() => setShareSuccess(''), 4500);
    }
  }

  // ═══ หน้าจอโหลดปรัชญา ═══
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col items-center justify-center p-4">
        <div className="text-6xl animate-bounce mb-4">🦅</div>
        <h2 className="text-2xl font-bold text-[#1A3A5C] mb-2 animate-pulse">กำลังวิเคราะห์ตัวตนของคุณ...</h2>
        
        {/* ข้อความปรัชญา */}
        <div className="mt-6 max-w-xs text-center">
          <p className="text-gray-500 italic text-sm leading-relaxed">
            &quot;คุณอาจมีตัวตนที่ซ่อนอยู่... <br/>
            มาทำความรู้จักคุณให้มากขึ้นกัน<br/>
            <strong className="text-indigo-400">นี่คือบุคลิกภาพและธาตุของคุณ</strong>&quot;
          </p>
        </div>
      </div>
    );
  }

  if (!result?.arch) return (
    <div className="text-center py-20">
      <p className="text-2xl mb-2">🦅</p>
      <p className="text-gray-500">ไม่พบผลลัพธ์</p>
      <a href="/" className="text-blue-600 underline text-sm mt-2 block">← กลับหน้าแรก</a>
    </div>
  );

  const a = result.arch;
  const sc = result;
  const top3 = result.compat_top3 || [];
  const hardest = result.compat_hardest;
  const bright = result.bright_flag;
  const conf = result.confidence_score;
  const u = result.user || {};

  // 🚨 เตรียมข้อมูลสำหรับ Radar Chart
  const radarData = [
    { subject: 'เปิดกว้าง', A: parseFloat(sc.score_o) || 0, fullMark: 5 },
    { subject: 'มีวินัย', A: parseFloat(sc.score_c) || 0, fullMark: 5 },
    { subject: 'เปิดเผย', A: parseFloat(sc.score_e) || 0, fullMark: 5 },
    { subject: 'ประนีประนอม', A: parseFloat(sc.score_a) || 0, fullMark: 5 },
    { subject: 'อ่อนไหว', A: parseFloat(sc.score_n) || 0, fullMark: 5 },
  ];

  // 🚨 เพิ่มระบบแปลชื่อ Q1-Q4 สำหรับป้ายใต้รูปภาพ
  const quadrantThaiNames: Record<string, string> = {
    'Q1': 'กลุ่มนักสำรวจบุกเบิก',
    'Q2': 'กลุ่มนักคิดนักกลยุทธ์',
    'Q3': 'กลุ่มผู้ประสานเชื่อมโยง',
    'Q4': 'กลุ่มผู้สร้างสรรค์'
  };

  return (
    <div className="space-y-3 pb-10">
      {/* ═══ ARCHETYPE CARD — ใหญ่เต็มเฟรม ═══ */}
      <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
        <div className="w-full max-w-xs mx-auto rounded-2xl overflow-hidden mb-4 bg-[#1A3A5C]" style={{ aspectRatio: '3/4' }}>
          {a.image_url ? <img src={a.image_url} alt={a.name_th} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center"><span className="text-6xl text-white">🦅</span></div>}
        </div>
        <h1 className="text-2xl font-bold text-[#1A3A5C]">{a.name_th}</h1>
        <p className="text-sm text-gray-400 italic">{a.name_en}</p>
        <div className="mt-2 inline-block px-4 py-1 rounded-full text-xs font-bold bg-blue-50 text-[#1A3A5C]">✦ {a.via_virtue}</div>
        
        {/* 🚨 อัปเดตป้าย Tags ให้แสดงผลภาษาไทย */}
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-[#1A3A5C] text-white">
            {quadrantThaiNames[sc.quadrant_primary] || sc.quadrant_primary}
          </span>
          {sc.quadrant_secondary && (
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-gray-200 text-gray-600">
              รอง: {quadrantThaiNames[sc.quadrant_secondary] || sc.quadrant_secondary}
            </span>
          )}
        </div>
        
        {/* ✅ ปรับให้แสดงผล long_desc แทน short_desc */}
        <p className="text-sm text-gray-500 mt-4 leading-relaxed text-left">
          {a.long_desc || a.short_desc}
        </p>

        {/* ═══ ย้ายจุดแข็ง อาชีพ ข้อควรระวัง และคำแนะนำมาไว้ส่วนนี้ ═══ */}
        {!isShared && (
          <div className="mt-6 space-y-3 text-left border-t border-gray-100 pt-5">
            {/* STRENGTHS */}
            {a.strength_1 && (
              <div className="bg-green-50 rounded-xl p-4">
                <h3 className="font-bold text-[#1A3A5C] text-sm mb-2">💪 จุดแข็ง</h3>
                <ul className="text-sm text-gray-700 space-y-1 pl-4 list-disc">
                  {[a.strength_1, a.strength_2, a.strength_3].filter(Boolean).map((s: string, i: number) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}

            {/* CAREER */}
            {a.career_hint && <InfoBox icon="💼" title="แนวทางอาชีพ" text={a.career_hint} bg="bg-purple-50" />}

            {/* CHALLENGE */}
            {a.challenge && <InfoBox icon="🎯" title="ประเด็นท้าทาย" text={a.challenge} bg="bg-yellow-50" />}

            {/* RECOMMENDATION */}
            {a.recommendation && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100 shadow-sm mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">💡</span>
                  <h3 className="font-bold text-[#1A3A5C] text-lg">คำแนะนำเพื่อการพัฒนา</h3>
                </div>
                {/* ใช้ whitespace-pre-wrap เพื่อให้รองรับการเว้นบรรทัด (Enter) จากฐานข้อมูล Supabase */}
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {a.recommendation}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ OCEAN RADAR CHART ═══ */}
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm mt-3">
        <h3 className="font-bold text-[#1A3A5C] text-sm mb-2 text-center">🕸️ มิติบุคลิกภาพ (OCEAN Model)</h3>
        <div className="w-full h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarData}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }} />
              {/* ซ่อนตัวเลขแกนกลางและกำหนดคะแนนเต็มที่ 5 */}
              <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} />
              <Radar
                name="OCEAN"
                dataKey="A"
                stroke="#1A3A5C"
                fill="#1A3A5C"
                fillOpacity={0.6}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="text-xs text-gray-400 mt-2 text-center">ยิ่งพื้นที่กราฟแผ่ออกกว้าง แปลว่าคุณมีลักษณะในมิตินั้นเด่นชัด</div>
      </div>

      {/* ═══ BRIGHT ═══ */}
      {bright && bright !== '⚗️' && (
        <div className="bg-amber-50 rounded-xl p-4 text-center">
          <span className="text-3xl">{bright}</span>
          <p className="text-sm font-bold text-[#1A3A5C] mt-1">ศักยภาพแฝง: {result.bright_type}</p>
        </div>
      )}

      {/* ═══ SOCIAL GUIDE ═══ */}
      {/* 🚨 ซ่อมส่วนที่แหว่งหายไปให้กลับมาทำงานได้ปกติ */}
      {a.misunderstand_text && (
        <div className="bg-purple-50 rounded-xl p-4">
          <h3 className="font-bold text-purple-800 text-sm mb-2">🗣 แนวทางการปรับให้เข้ากับคนแต่ละกลุ่ม</h3>
          <div className="bg-white rounded-lg p-3 mb-2 text-sm text-gray-600 leading-relaxed border-l-4 border-[#1A3A5C]">{a.misunderstand_text}</div>
          
          <div className="grid grid-cols-2 gap-3">
            {[
              { k: 'Q1', n: 'กลุ่มนักสำรวจบุกเบิก', tip: a.social_tip_q1 },
              { k: 'Q2', n: 'กลุ่มนักคิดนักกลยุทธ์', tip: a.social_tip_q2 },
              { k: 'Q3', n: 'กลุ่มผู้ประสานเชื่อมโยง', tip: a.social_tip_q3 },
              { k: 'Q4', n: 'กลุ่มผู้สร้างสรรค์', tip: a.social_tip_q4 }
            ].filter(t => t.tip).map(t => (
                <div key={t.k} className="bg-white rounded-lg shadow-sm border border-purple-100 overflow-hidden flex flex-col">
                  {/* แบนเนอร์หัวกล่อง */}
                  <div className="bg-[#1A3A5C] text-white font-bold text-[0.65rem] sm:text-xs py-1.5 px-2 text-center tracking-wide">
                    {t.n}
                  </div>
                  {/* เนื้อหาคำแนะนำ */}
                  <div className="p-2.5 text-xs leading-relaxed text-gray-700 bg-white">
                    {t.tip}
                  </div>
                </div>
              ))}
          </div>
          
          {a.self_warning && <div className="bg-orange-50 rounded-lg p-2.5 mt-2 text-xs text-orange-700 leading-relaxed">⚠️ {a.self_warning}</div>}
        </div>
      )}

      {/* ═══ COMPATIBILITY — การ์ดแนวตั้ง ═══ */}
      {top3.length > 0 && (
        <div className="bg-indigo-50 rounded-xl p-4">
          <h3 className="font-bold text-indigo-800 text-sm mb-3 text-center">💫 ประเภทบุคลิกที่มีแนวโน้มเข้ากันได้ดี</h3>
          <div className="grid grid-cols-3 gap-2">
            {top3.map((c: any) => (
              <button key={c.id} onClick={() => { setShowCompat(true); trackEvent('compatibility_viewed', 'result'); }}
                className="bg-white rounded-xl p-2 text-center shadow-sm border border-indigo-100 hover:shadow-md transition-all">
                <div className="w-full rounded-lg overflow-hidden mb-1.5 bg-[#1A3A5C] flex items-center justify-center" style={{ aspectRatio: '3/4' }}>
                  {c.image_url ? <img src={c.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl text-white">🦅</span>}
                </div>
                <p className="font-bold text-[#1A3A5C] leading-tight" style={{ fontSize: '0.65rem' }}>{c.name_th}</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full font-bold bg-green-100 text-green-700" style={{ fontSize: '0.6rem' }}>{Math.round(c.score * 100)}%</span>
              </button>
            ))}
          </div>
          
          {hardest && (
            <>
              <h4 className="text-xs font-bold text-[#1A3A5C] mt-4 mb-2 text-center">⚡ บุคลิกที่อาจต้องใช้ปรับตัวสูง</h4>
              <div className="bg-white rounded-lg p-2.5 flex items-center gap-2 border border-indigo-100 shadow-sm">
                <div className="w-10 h-12 rounded-lg overflow-hidden bg-[#1A3A5C] flex-shrink-0 flex items-center justify-center">
                  {hardest.image_url ? <img src={hardest.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-sm text-white">🦅</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-700 truncate">{hardest.name_th}</p>
                  <span className="text-indigo-500 font-semibold" style={{ fontSize: '0.6rem' }}>{Math.round(hardest.score * 100)}%</span>
                </div>
              </div>
            </>
          )}
          
          <button onClick={() => setShowCompat(true)} className="w-full mt-2 py-2 text-xs font-bold text-[#1A3A5C] bg-white rounded-lg border border-[#1A3A5C] hover:bg-blue-50 transition-colors">🔍 ดูรายละเอียดเพิ่มเติม</button>
        </div>
      )}



      {/* ═══ CONFIDENCE ═══ */}
      {!isShared && conf !== null && conf !== undefined && (
        <div className={`rounded-xl p-3 text-center text-sm ${conf >= 80 ? 'bg-green-50' : conf >= 50 ? 'bg-yellow-50' : 'bg-orange-50'}`}>
          {conf >= 80 ? '✅' : '⚠️'} ความน่าเชื่อถือ: {conf}% ({result.confidence_level})
        </div>
      )}

      {/* ═══ RISK NOTICE ═══ */}
      {!isShared && result.hasRiskFlag && (
        <div className="bg-blue-50 rounded-xl p-3 text-center text-sm text-blue-700 leading-relaxed">
          💙 หากต้องการคุยกับคนที่พร้อมรับฟัง โทร <a href="tel:1323" className="font-bold underline">1323</a> ได้ตลอด 24 ชม.
        </div>
      )}

      {/* ═══ SHARE BUTTONS ═══ */}
      <div className="bg-blue-50 rounded-xl p-4">
        <h3 className="font-bold text-[#1A3A5C] text-sm mb-2">📤 แชร์ผลลัพธ์ & ชวนเพื่อน</h3>
        <div className="grid grid-cols-4 gap-2">
          {[
            { p:'facebook', icon:'📘', label:'Facebook' },
            { p:'line', icon:'💬', label:'LINE' },
            { p:'native', icon:'📲', label:'แอปอื่นๆ' }, 
            { p:'download', icon:'📥', label:'โหลดรูป' } 
          ].map(s => (
            <button key={s.p} onClick={() => doShare(s.p)}
              className="py-2.5 rounded-lg border border-blue-200 bg-white hover:bg-blue-100 hover:border-[#1A3A5C] transition-all text-center flex flex-col items-center justify-center">
              <span className="block text-lg mb-0.5">{s.icon}</span>
              <span className="text-gray-600 font-bold" style={{ fontSize: '0.6rem', lineHeight: '1.2' }}>{s.label}</span>
            </button>
          ))}
        </div>
        {shareSuccess && <p className="text-xs font-bold text-green-600 text-center mt-3 bg-green-50 p-2 rounded-lg">{shareSuccess}</p>}
      </div>

      {/* ═══ ID + DISCLAIMER ═══ */}
      <div className="bg-gray-100 rounded-lg p-2 text-center font-mono text-xs text-gray-500 border border-gray-200">DVJ ID: {id}</div>
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 text-center text-yellow-800" style={{ fontSize: '0.65rem' }}>
        <strong className="text-orange-600">⚠️</strong> ผลนี้เป็นสัญญาณเบื้องต้น ไม่ใช่การวินิจฉัยทางการแพทย์
      </div>

      {/* ═══ CTA — คนที่เข้าจากลิงก์แชร์ ═══ */}
      {isShared && (
        <a href={`/?ref=${id}&src=shared_result`}
          className="block w-full py-4 rounded-xl bg-[#1A3A5C] text-white text-center font-bold text-base shadow-lg hover:bg-[#2E75B6] transition-colors">
          🦅 มาค้นหาตัวตนของคุณ! → ทำแบบทดสอบฟรี
        </a>
      )}

      {!isShared && (
        <a href="/" className="block w-full py-3 rounded-xl bg-[#1A3A5C] text-white text-center font-bold text-sm hover:bg-[#2E75B6] transition-colors">🏠 กลับหน้าหลัก</a>
      )}

      {/* ═══ COMPATIBILITY MODAL ═══ */}
      {showCompat && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowCompat(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-[#1A3A5C]">💫 รายละเอียดความเข้ากัน</h3>
              <button onClick={() => setShowCompat(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <p className="text-xs text-gray-500 mb-4">คำนวณจาก VIA + Quadrant + Jungian </p>
            <h4 className="font-bold text-sm text-green-700 mb-2">🤝 เข้ากันได้ดีที่สุด</h4>
            {top3.map((c: any) => (
              <div key={c.id} className="bg-green-50 rounded-xl p-3 mb-2 flex items-center gap-3">
                <div className="w-14 h-20 rounded-lg overflow-hidden bg-[#1A3A5C] flex-shrink-0 flex items-center justify-center">
                  {c.image_url ? <img src={c.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-xl text-white">🦅</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#1A3A5C] text-sm">{c.name_th}</p>
                  <p className="text-xs text-gray-500">{c.name_en || c.id}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full"><div className="h-1.5 bg-green-500 rounded-full" style={{ width: `${c.score * 100}%` }} /></div>
                    <span className="text-xs font-bold text-green-700">{Math.round(c.score * 100)}%</span>
                  </div>
                </div>
              </div>
            ))}
            {hardest && (
              <>
                <h4 className="font-bold text-sm text-indigo-700 mt-4 mb-2">⚡ บุคลิกที่อาจต้องใช้ปรับตัวสูง</h4>
                <div className="bg-indigo-50 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-14 h-20 rounded-lg overflow-hidden bg-[#1A3A5C] flex-shrink-0 flex items-center justify-center">
                    {hardest.image_url ? <img src={hardest.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-xl text-white">🦅</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#1A3A5C] text-sm">{hardest.name_th}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full"><div className="h-1.5 bg-indigo-400 rounded-full" style={{ width: `${hardest.score * 100}%` }} /></div>
                      <span className="text-xs font-bold text-indigo-600">{Math.round(hardest.score * 100)}%</span>
                    </div>
                  </div>
                </div>
              </>
            )}
            <div className="mt-4 p-3 bg-blue-50 rounded-xl text-xs text-gray-600 leading-relaxed">
              <strong className="text-[#1A3A5C]">🔍 วิธีดูว่าเพื่อนเป็น Archetype ไหน:</strong><br/>กดแชร์ลิงก์ให้เพื่อนทำแบบทดสอบ → เมื่อเพื่อนทำเสร็จ ระบบจะเชื่อมโยงให้อัตโนมัติ
            </div>
            <button onClick={() => setShowCompat(false)} className="w-full mt-4 py-2.5 rounded-xl bg-[#1A3A5C] text-white font-bold text-sm hover:bg-[#2E75B6] transition-colors">← กลับหน้าผลลัพธ์</button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoBox({ icon, title, text, bg }: { icon: string; title: string; text: string; bg: string }) {
  return (
    <div className={`${bg} rounded-xl p-4`}>
      <h3 className="font-bold text-[#1A3A5C] text-sm mb-1">{icon} {title}</h3>
      <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
    </div>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-gray-500">กำลังโหลด...</div>}>
      <ResultPageInner />
    </Suspense>
  );
}