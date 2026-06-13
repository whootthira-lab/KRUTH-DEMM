import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { calcScores, getDominant, calcJungian, calcViaScores, calcFuzzyQuadrant,
         calcArchetypeId, calcMultiDimFlags, calcBrightFlag, calcConfidence,
         calcDosha, calcClinicalSignals } from '@/lib/scoring'; // 🚨 เพิ่ม calcClinicalSignals ตรงนี้
import type { Answer } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dvjId, band, answers, sessionId } = body as {
      dvjId: string; band: string; answers: Answer[]; sessionId: string;
    };

    if (!dvjId || !band || !answers?.length) {
      return NextResponse.json({ error: 'missing data' }, { status: 400 });
    }

    // ═══ 1. คำนวณคะแนนพื้นฐาน (เรียกใช้ V7.3 Scoring) ═══
    const sc = calcScores(answers);
    const dom = getDominant(sc);
    const jung = calcJungian(answers, sc); 
    const quad = calcFuzzyQuadrant(sc.O, sc.E);
    const arcResult = calcArchetypeId(sc, answers, quad.primary); 
    const userArchetypeId = arcResult.id; 
    
    const flags = calcMultiDimFlags(sc, band, answers);
    const bright = calcBrightFlag(sc, jung.type, flags);
    const dosha = calcDosha(sc, jung.type);
    const confidence = calcConfidence(answers, sc);
    const via = calcViaScores(answers);

    // 🚨 ═══ 1.5 คำนวณ Clinical Signals + Delusion
    const clinical = calcClinicalSignals(sc, answers, flags, confidence);

    // ═══ 2. คำนวณ Compatibility (V7.3 Hybrid Engine) ═══
    const { data: vTable } = await supabase.from('compat_via').select('*');
    const { data: qTable } = await supabase.from('compat_quad').select('*');
    const { data: jTable } = await supabase.from('compat_jung').select('*');
    const { data: allArchs } = await supabase.from('archetypes').select('*').eq('is_active', true);

    const getScore = (table: any[] | null, a: string, b: string, colA: string, colB: string): number => {
      if (!table) return 0.5;
      const row = table.find(r =>
        (r[colA] === a && r[colB] === b) || (r[colA] === b && r[colB] === a)
      );
      return row ? parseFloat(row.score) : 0.5;
    };

    const userArchData = (allArchs || []).find(item => item.id === userArchetypeId);
    const userVia = userArchData?.via_virtue || userArchetypeId.match(/Y_(\w+)-/)?.[1] || 'W';
    const userJung = userArchData?.jungian || jung.type;

    const compatResults = (allArchs || [])
      .filter(target => target.id !== userArchetypeId)
      .map(target => {
        const tVia = target.via_virtue || target.id.match(/Y_(\w+)-/)?.[1] || 'W';
        const tQuad = target.quadrant || target.id.match(/-(\w+)-/)?.[1] || 'Q1';
        const tJung = target.jungian || target.id.match(/-(\w+)$/)?.[1] || 'TJ';

        const sVia = getScore(vTable, userVia, tVia, 'via_a', 'via_b');

        let sQuad = 0;
        if (quad.isBorderline && quad.secondary) {
           const sPrimary = getScore(qTable, quad.primary, tQuad, 'quad_a', 'quad_b');
           const sSecondary = getScore(qTable, quad.secondary, tQuad, 'quad_a', 'quad_b');
           sQuad = (sPrimary * 0.7) + (sSecondary * 0.3); 
        } else {
           sQuad = getScore(qTable, quad.primary, tQuad, 'quad_a', 'quad_b');
        }

        const sJung = getScore(jTable, userJung, tJung, 'jung_a', 'jung_b');
        const rawScore = (sVia * 0.5) + (sQuad * 0.3) + (sJung * 0.2);

        let stretched = ((rawScore - 0.4) / (0.9 - 0.4)) * 100;
        let finalPercent = Math.max(15, Math.min(98, stretched)); 

        return {
          id: target.id,
          name_th: target.name_th || target.id,
          name_en: target.name_en || target.english_name || '',
          image_url: target.image_url || '',
          score: Math.round(finalPercent) / 100, 
        };
      });

    const sorted = [...compatResults].sort((a, b) => b.score - a.score);
    const top3 = sorted.slice(0, 3);
    const hardest = sorted[sorted.length - 1] || null;

    // ═══ 3. ดึงข้อมูล Archetype ของผู้ใช้เพื่อส่งให้หน้าบ้าน ═══
    const archData = userArchData;
    const archetype = archData ? {
      id: archData.id, name_th: archData.name_th, name_en: archData.name_en || archData.english_name,
      via: archData.via_virtue, quadrant: archData.quadrant, jungian: archData.jungian,
      short_desc: archData.short_desc, long_desc: archData.long_desc,
      strengths: [archData.strength_1, archData.strength_2, archData.strength_3].filter(Boolean),
      challenge: archData.challenge, career_hint: archData.career_hint,
      color: archData.color_hex || '#1A3A5C', image_url: archData.image_url,
      caution: archData.caution, recommendation: archData.recommendation,
      misunderstand: archData.misunderstand_text,
      social_tips: { Q1: archData.social_tip_q1, Q2: archData.social_tip_q2, Q3: archData.social_tip_q3, Q4: archData.social_tip_q4 },
      self_warning: archData.self_warning,
    } : { id: userArchetypeId, name_th: 'KRUTH DEMM', name_en: 'In Development', short_desc: '', long_desc: '',
          strengths: [], challenge: '', career_hint: '', color: '#1A3A5C', image_url: '',
          via: '', quadrant: quad.primary, jungian: jung.type, caution: '', recommendation: '',
          misunderstand: '', social_tips: { Q1:'', Q2:'', Q3:'', Q4:'' }, self_warning: '' };

    // 🚨 ═══ 3.5 ดึงข้อมูลเลขศาสตร์เพื่อทำ Research Data ═══ 🚨
    let energyId = null;
    let energyName = null;
    let energyKeywords = null;

    // ไปแอบดูเลขกำลังประจำตัว (num_life) จากตาราง users
    const { data: userData } = await supabase.from('users').select('num_life').eq('id', dvjId).single();
    
    if (userData && userData.num_life !== null) {
      energyId = userData.num_life;
      // เอาเลขไปเทียบหาความหมายในตาราง 00-99
      const { data: energyData } = await supabase.from('numerology_meanings').select('energy_name, energy_keywords').eq('energy_id', energyId).single();
      
      if (energyData) {
        energyName = energyData.energy_name;
        energyKeywords = energyData.energy_keywords;
      }
    }

    // ═══ 4. บันทึกผลลัพธ์ลงฐานข้อมูล ═══
    const logRows = answers.map(a => ({
      session_id: sessionId, user_id: dvjId,
      question_id: a.q_id, section: '', dimension: a.dimension,
      answer_key: a.choice, score_raw: a.score_raw, alert_flag: a.alert,
      latency_ms: a.latency_ms || null, changed_answer: a.changed || false,
    }));
    await supabase.from('quiz_logs').insert(logRows);

    await supabase.from('results').insert({
      user_id: dvjId, session_id: sessionId,
      archetype_id: userArchetypeId,
      archetype_name_th: archetype.name_th,
      archetype_name_en: archetype.name_en,
      score_o: sc.O, score_c: sc.C, score_e: sc.E, score_a: sc.A, score_n: sc.N,
      quadrant_primary: quad.primary, quadrant_secondary: quad.secondary,
      confidence_o: quad.conf_O, confidence_e: quad.conf_E,
      via_dominant: Object.entries(via).reduce((a, b) => a[1] >= b[1] ? a : b)[0],
      via_scores: via,
      jungian_type: jung.type,
      jungian_scores: { T: jung.T, F: jung.F, J: jung.J, P: jung.P },
      pdcr_fire: sc.pDCR_F, pdcr_wind: sc.pDCR_W, pdcr_water: sc.pDCR_A, pdcr_earth: sc.pDCR_E,
      pdcr_dominant: dom,
      indian_dosha: dosha,
      compat_top3: top3,
      compat_hardest: hardest,
      bright_flag: bright.flag === '⚗️' ? null : bright.flag,
      bright_type: bright.flag === '⚗️' ? null : bright.type,
      confidence_score: confidence.score,
      confidence_level: confidence.level,
      confidence_details: confidence.details,
      
      // 🚨 บันทึกข้อมูลวิจัย (Research Data) แพ็กคู่ไปกับผลลัพธ์ 🚨
      energy_id: energyId,
      energy_name: energyName,
      energy_keywords: energyKeywords
    });

    // 🚨 ═══ 4.5 บันทึก Flags + Clinical Signals ═══ 🚨
    await supabase.from('category_flags').insert({
      user_id: dvjId, session_id: sessionId,
      rain_level: flags.rain.level, rain_score: flags.rain.score,
      bolt_level: flags.bolt.level, bolt_score: flags.bolt.score,
      fog_level: flags.fog.level, fog_score: flags.fog.score,
      battery_level: flags.battery.level, battery_score: flags.battery.score,
      bright_flag: bright.flag, bright_type: bright.type,
      has_crisis: answers.some(a => a.alert === 'CRISIS' && (a.choice === 'C' || a.choice === 'D')),
      
      // 🚨 บันทึก Clinical Signals ลงฐานข้อมูลอย่างลับๆ (เพื่อใช้ใน Platform B) 🚨
      adhd_score: clinical.adhd.score,
      adhd_level: clinical.adhd.level,
      adhd_details: clinical.adhd.details,
      burnout_score: clinical.burnout.score,
      burnout_level: clinical.burnout.level,
      burnout_details: clinical.burnout.details,
      ocd_score: clinical.ocd.score,
      ocd_level: clinical.ocd.level,
      socialanxiety_score: clinical.socialAnxiety.score,
      socialanxiety_level: clinical.socialAnxiety.level,
      socialanxiety_details: clinical.socialAnxiety.details,
      delusion_score: clinical.delusion.score,
      delusion_level: clinical.delusion.level,
      delusion_details: clinical.delusion.details,
      delusion_action: clinical.delusion.action,
    });

    await supabase.from('quiz_sessions').update({
      status: 'completed', completed_at: new Date().toISOString(),
      total_duration_sec: Math.round(answers.reduce((s, a) => s + (a.latency_ms || 0), 0) / 1000),
      questions_answered: answers.length,
    }).eq('id', sessionId);

    // ═══ 5. ส่ง Response กลับไปให้หน้าบ้าน (Platform A) ═══
    // สังเกตว่าเรา ไม่ ส่งตัวแปร `clinical` กลับไปหาผู้ใช้ เพื่อป้องกันความแตกตื่น
    const amberOrRed = (l: string) => l === '🟠' || l === '🔴';

    return NextResponse.json({
      ok: true,
      scores: sc,
      quadrant: quad,
      archetype,
      hasRiskFlag: amberOrRed(flags.rain.level) || amberOrRed(flags.bolt.level) || amberOrRed(flags.fog.level) || amberOrRed(flags.battery.level),
      hasBrightFlag: bright.flag === '💎' || bright.flag === '🌱',
      brightFlag: bright.flag === '⚗️' ? null : bright.flag,
      brightType: bright.flag === '⚗️' ? null : bright.type,
      compat: { top3, hardest },
      dosha,
      confidence,
    });
  } catch (error) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}