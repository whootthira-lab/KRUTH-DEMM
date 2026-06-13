'use client';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase, trackEvent, trackPageView, getDeviceType, getBrowser } from '@/lib/supabase';
import { BAND_INFO, type Band, type Question, type Answer } from '@/lib/types';

type Phase = 'register' | 'quiz' | 'submitting' | 'crisis';

const SEC_NAMES: Record<string, string> = {
  A: 'การตอบตามที่คุณคิดและรู้สึกจริงๆ จะช่วยให้เข้าใจตัวเองมากขึ้น',
  B: 'จุดแข็งของคุณ', C: 'สไตล์การคิด', D: 'ความเป็นอยู่ของคุณ',
  'D+': 'เข้าใจคุณให้ลึกขึ้น', E: 'ธาตุประจำตัวคุณ', F: 'สุขภาวะ',
};

const ENCOURAGEMENTS = [
  'ทุกคนมีช่วงเวลาที่ยากลำบาก และการขอความช่วยเหลือไม่ใช่ความอ่อนแอ — มันคือความกล้าหาญ',
  'คุณมีคุณค่ามากกว่าที่คุณคิด ไม่ว่าวันนี้จะรู้สึกอย่างไร',
  'ความรู้สึกเหนื่อยจะผ่านไป เหมือนคืนที่มืดที่สุดก็ยังมีรุ่งสาง',
  'มีคนที่พร้อมรับฟังคุณเสมอ คุณไม่จำเป็นต้องเผชิญทุกอย่างคนเดียว',
];

function QuizPageInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const band = (sp.get('band') || 'E') as Band;
  const refId = sp.get('ref') || '';
  const refSrc = sp.get('src') || '';
  const lineUserId = sp.get('line_user_id') || sp.get('line_id') || '';

  // ═══ STATE ═══
  const [phase, setPhase] = useState<Phase>('register');
  const [dvjId, setDvjId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [regData, setRegData] = useState<any>(null);

  // 🚨 1. จุดแทรกตัวแปรสำหรับ Item Analysis (ระบบวิเคราะห์พฤติกรรม)
  const [quizSessionId] = useState(() => crypto.randomUUID()); 
  const [analyticsData, setAnalyticsData] = useState<any[]>([]);

  // Registration
  const [day, setDay] = useState(''); const [month, setMonth] = useState(''); const [year, setYear] = useState('');
  const [fname, setFname] = useState(''); const [lname, setLname] = useState('');
  const [idcard, setIdcard] = useState(''); const [gender, setGender] = useState('');
  const [org, setOrg] = useState(''); const [province, setProvince] = useState('');
  const [pdpa, setPdpa] = useState(false); const [regErr, setRegErr] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);

  // Organizations
  const [orgsList, setOrgsList] = useState<{ id: string; name: string; org_code: string }[]>([]);
  const [orgOption, setOrgOption] = useState('');
  const [customOrg, setCustomOrg] = useState('');

  // Quiz
  const [allQs, setAllQs] = useState<Question[]>([]);
  const [activeQs, setActiveQs] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastSection, setLastSection] = useState('');
  const [scrSignals, setScrSignals] = useState<Record<string, number>>({});
  const [branchInserted, setBranchInserted] = useState(false);

  // Timing
  const questionStartTime = useRef<number>(Date.now());
  const [changeCount, setChangeCount] = useState(0);

  // Crisis
  const [encIdx, setEncIdx] = useState(0);
  const [showBreathing, setShowBreathing] = useState(false);

  useEffect(() => { 
    trackPageView('/quiz'); 
    loadRegions(); 
    loadOrganizations();
  }, []);

  // ═══ LOAD ORGANIZATIONS ═══
  async function loadOrganizations() {
    try {
      const { data } = await supabase.from('organizations').select('id, name, org_code').order('name');
      if (data) setOrgsList(data);
    } catch (e) {
      console.error('Error loading organizations:', e);
    }
  }

  // ═══ LOAD REGIONS ═══
  async function loadRegions() {
    const { data } = await supabase.from('locations').select('region').order('region');
    if (!data) return;
    const unique = Array.from(new Set(data.map((r: any) => r.region)));
    setRegions(unique as string[]);
  }

  async function loadProvinces(region: string) {
    const { data } = await supabase.from('locations').select('province_th').eq('region', region).order('province_th');
    setProvinces((data || []).map((r: any) => r.province_th));
  }

  // ═══ REGISTER ═══
  async function doRegister() {
    setRegErr('');
    if (!day || !month || !year || !fname || !lname || !gender || !province) {
      setRegErr('กรุณากรอกข้อมูลให้ครบทุกช่อง'); return;
    }
    
    // ตรวจสอบข้อมูลหน่วยงาน
    const orgNameToSend = orgOption === 'OTHER' ? customOrg.trim() : (orgsList.find(o => o.org_code === orgOption)?.name || '');
    if (!orgOption || (orgOption === 'OTHER' && !orgNameToSend)) {
      setRegErr('กรุณาเลือกหรือระบุหน่วยงานของคุณ'); return;
    }

    if (idcard && idcard.length !== 13) { setRegErr('เลขบัตรประชาชนต้อง 13 หลัก'); return; }
    if (!pdpa) { setRegErr('กรุณายินยอม PDPA ก่อนทำแบบประเมิน'); return; }

    setRegLoading(true);
    trackEvent('register_started', 'registration', { band });

    try {
      const res = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          band, day: +day, month: +month, year: +year, fname, lname, idcard, gender,
          province, referrerId: refId, referralSource: refSrc,
          deviceType: getDeviceType(), browser: getBrowser(),
          referrerUrl: typeof document !== 'undefined' ? document.referrer : '',
          organization: orgNameToSend,
          lineUserId: lineUserId
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'registration failed');

      setDvjId(data.dvjId);
      setSessionId(data.sessionId);
      setRegData(data);
      trackEvent('register_completed', 'registration', { band, dvjId: data.dvjId });
      loadQuestions(data.dvjId, data.sessionId);
    } catch (e: any) {
      setRegErr('เกิดข้อผิดพลาด: ' + e.message);
      setRegLoading(false);
    }
  }

  // ═══ LOAD QUESTIONS ═══
  async function loadQuestions(dvj: string, sess: string) {
    const res = await fetch(`/api/questions?band=${band}`);
    const qs: Question[] = await res.json();
    if (!qs.length) { setRegErr('ไม่พบคำถาม'); setRegLoading(false); return; }

    setAllQs(qs);
    // Phase 1: only ALWAYS questions
    setActiveQs(qs.filter(q => (q.branch_trigger || 'ALWAYS') === 'ALWAYS'));
    setIdx(0); setAnswers([]); setSelected(null); setLastSection('');
    setScrSignals({}); setBranchInserted(false);
    setPhase('quiz');
    questionStartTime.current = Date.now();

    trackEvent('quiz_started', 'quiz', { band, total_questions: qs.length });
    await supabase.from('quiz_sessions').update({ status: 'section_a', questions_total: qs.length }).eq('id', sess);
  }

  // ═══ SELECT CHOICE ═══
  const selectChoice = useCallback((key: string) => {
    if (selected && selected !== key) setChangeCount(c => c + 1);
    setSelected(key);
  }, [selected]);

  // ═══ NEXT ═══
  async function nextQuestion() {
    if (!selected) return;
    const q = activeQs[idx];
    const scoreRaw = q.scores[selected as keyof typeof q.scores] || '';
    
    // 🚨 2. จุดแทรกระบบจับเวลา: คำนวณเวลาและโยนใส่ตะกร้า
    const endTime = Date.now();
    const latency = endTime - questionStartTime.current;
    
    const newAnalyticsRecord = {
      session_id: quizSessionId,
      question_id: q.q_id,
      selected_score: selected, // เก็บ A, B, C, D ที่กด
      time_spent_ms: latency
    };
    
    // ใช้ setAnalyticsData แบบ functional update เพื่อป้องกันตะกร้าหาย
    setAnalyticsData(prev => [...prev, newAnalyticsRecord]);

    const answer: Answer = {
      q_id: q.q_id, choice: selected, score_raw: scoreRaw,
      dimension: q.dimension, alert: q.alert_flag || '',
      latency_ms: latency, changed: changeCount > 0,
    };

    const newAnswers = [...answers, answer];
    setAnswers(newAnswers);

    // Track
    trackEvent('question_answered', 'quiz', {
      q_id: q.q_id, choice: selected, latency_ms: latency, changed: changeCount > 0,
    }, dvjId, sessionId);

    // Parse SCR signals
    const newSignals = { ...scrSignals };
    if (scoreRaw) {
      for (const part of scoreRaw.split('|')) {
        const m = part.match(/^(SCR-[A-Z]+):(.+)/);
        if (m) newSignals[m[1]] = (newSignals[m[1]] || 0) + parseFloat(m[2]);
      }
    }
    setScrSignals(newSignals);

    // Crisis check
    if (q.alert_flag === 'CRISIS' && (selected === 'C' || selected === 'D')) {
      trackEvent('crisis_triggered', 'crisis', { q_id: q.q_id, choice: selected });
      setPhase('crisis');
      // Save partial answers
      submitQuiz(newAnswers, true);
      return;
    }
    if (scoreRaw.includes('CRISIS:RED')) {
      setPhase('crisis');
      submitQuiz(newAnswers, true);
      return;
    }

    // Branch checkpoint: after Section D, before E
    const nextQ = activeQs[idx + 1];
    if (q.section === 'D' && nextQ && (nextQ.section === 'E' || nextQ.section === 'D+') && !branchInserted) {
      const branchQs = insertBranches(newSignals);
      if (branchQs.length > 0) {
        const insertIdx = activeQs.findIndex((aq, i) => i > idx && aq.section === 'E');
        const pos = insertIdx >= 0 ? insertIdx : activeQs.length;
        const newActive = [...activeQs];
        newActive.splice(pos, 0, ...branchQs);
        setActiveQs(newActive);
        trackEvent('branch_triggered', 'quiz', { signals: newSignals, branches: branchQs.length });
      }
      setBranchInserted(true);
    }

    // Move to next
    if (idx + 1 >= activeQs.length) {
      submitQuiz(newAnswers, false);
    } else {
      setIdx(idx + 1);
      setSelected(null);
      setChangeCount(0);
      questionStartTime.current = Date.now(); // 🚨 รีเซ็ตนาฬิกาเริ่มข้อใหม่

      // Update session status
      const nextSec = activeQs[idx + 1]?.section;
      if (nextSec && nextSec !== q.section) {
        const statusMap: Record<string, string> = { A:'section_a', B:'section_b', C:'section_c', D:'section_d', 'D+':'section_d_plus', E:'section_e' };
        await supabase.from('quiz_sessions').update({ status: statusMap[nextSec] || 'started', last_section: nextSec, questions_answered: newAnswers.length }).eq('id', sessionId);
      }
    }
  }

  // ═══ INSERT BRANCHES ═══
  function insertBranches(signals: Record<string, number>): Question[] {
    const decisions: Record<string, boolean> = {};
    if ((signals['SCR-DEP'] || 0) >= 2) decisions['2Q_POS'] = true;
    if ((signals['SCR-GAD'] || 0) >= 2) decisions['SCR-GAD>=2'] = true;
    if ((signals['SCR-PAR'] || 0) >= 2) decisions['SCR-PAR>=2'] = true;

    return allQs.filter(q => {
      const t = q.branch_trigger || 'ALWAYS';
      return t !== 'ALWAYS' && decisions[t];
    });
  }

  // ═══ SUBMIT ═══
  async function submitQuiz(finalAnswers: Answer[], isCrisis: boolean) {
    if (!isCrisis) setPhase('submitting');

    // 🚨 3. จุดส่งข้อมูล: นำตะกร้าพฤติกรรมยิงขึ้น Supabase
    if (analyticsData.length > 0) {
      // แอบยิงข้อมูลไปเงียบๆ (ไม่ต้อง await รอให้เสร็จ เพื่อไม่ให้เว็บค้าง)
      supabase.from('quiz_analytics').insert(analyticsData).then(({ error }) => {
        if (error) console.error('Error saving item analytics:', error);
      });
    }

    try {
      const res = await fetch('/api/score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dvjId, band, answers: finalAnswers, sessionId }),
      });
      const data = await res.json();
      if (data.ok && !isCrisis) {
        trackEvent('quiz_completed', 'quiz', {
          duration_sec: Math.round(finalAnswers.reduce((s, a) => s + a.latency_ms, 0) / 1000),
          questions_answered: finalAnswers.length,
        });
        router.push(`/result/${dvjId}`);
      }
    } catch (e) {
      if (!isCrisis) setPhase('quiz'); // Allow retry
    }
  }

  // ═══ CRISIS ACTIONS ═══
  function crisisContinue() {
    // Skip to Section E
    const remaining = activeQs.filter(q => q.section === 'E');
    if (remaining.length > 0) {
      setActiveQs(remaining);
      setIdx(0); setSelected(null); setPhase('quiz');
      questionStartTime.current = Date.now();
    } else {
      router.push(`/result/${dvjId}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: REGISTRATION
  // ═══════════════════════════════════════════════════════════
  if (phase === 'register') {
    const info = BAND_INFO[band];
    return (
      <div className="bg-white rounded-2xl p-6 shadow-lg">
        <button onClick={() => router.push('/')} className="text-brand text-xs underline mb-3 block">← เลือกช่วงอายุใหม่</button>
        <span className="inline-block bg-brand text-white text-xs font-bold px-3 py-1 rounded-full mb-3">Band {band} — {info?.name}</span>
        <h2 className="text-brand font-bold mb-1">ลงทะเบียนก่อนทำแบบประเมิน</h2>
        <p className="text-xs text-gray-500 mb-4">กรุณากรอกข้อมูลให้ครบถ้วน <span className="text-red-500">*</span> = จำเป็น</p>

        {regErr && <div className="bg-red-50 text-red-600 text-xs p-2.5 rounded-lg mb-3">{regErr}</div>}

        <label className="text-xs font-semibold text-gray-700 block mt-3 mb-1">วันเกิด <span className="text-red-500">*</span></label>
        <div className="grid grid-cols-3 gap-2">
          <select value={day} onChange={e => setDay(e.target.value)} className="border rounded-lg p-2 text-sm">
            <option value="">วัน</option>
            {Array.from({length: 31}, (_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
          </select>
          <select value={month} onChange={e => setMonth(e.target.value)} className="border rounded-lg p-2 text-sm">
            <option value="">เดือน</option>
            {['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'].map((m, i) =>
              <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <input type="number" placeholder="ปี ค.ศ. (เช่น 1986 , 2003)" value={year} onChange={e => setYear(e.target.value)}
            className="border rounded-lg p-2 text-sm" min="1944" max="2020" />
        </div>

        <label className="text-xs font-semibold text-gray-700 block mt-3 mb-1">ชื่อ <span className="text-red-500">*</span></label>
        <input value={fname} onChange={e => setFname(e.target.value)} placeholder="ชื่อจริง (เพื่อคำนวณธาตุประกอบ)" className="w-full border rounded-lg p-2 text-sm" />

        <label className="text-xs font-semibold text-gray-700 block mt-3 mb-1">นามสกุล <span className="text-red-500">*</span></label>
        <input value={lname} onChange={e => setLname(e.target.value)} placeholder="นามสกุล (เพื่อคำนวณธาตุประกอบ)" className="w-full border rounded-lg p-2 text-sm" />


        <label className="text-xs font-semibold text-gray-700 block mt-3 mb-1">เพศ <span className="text-red-500">*</span></label>
        <select value={gender} onChange={e => setGender(e.target.value)} className="w-full border rounded-lg p-2 text-sm">
          <option value="">— เลือก —</option>
          <option value="M">ชาย</option><option value="F">หญิง</option><option value="O">อื่นๆ</option>
        </select>

        <label className="text-xs font-semibold text-gray-700 block mt-3 mb-1">ภูมิภาค</label>
        <select onChange={e => { loadProvinces(e.target.value); }} className="w-full border rounded-lg p-2 text-sm">
          <option value="">— เลือกภาค —</option>
          <option value="">ทั้งหมด</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <label className="text-xs font-semibold text-gray-700 block mt-3 mb-1">จังหวัด <span className="text-red-500">*</span></label>
        <select value={province} onChange={e => setProvince(e.target.value)} className="w-full border rounded-lg p-2 text-sm">
          <option value="">— เลือกจังหวัด —</option>
          {provinces.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <label className="text-xs font-semibold text-gray-700 block mt-3 mb-1">หน่วยงาน / โรงเรียน <span className="text-red-500">*</span></label>
        <select value={orgOption} onChange={e => setOrgOption(e.target.value)} className="w-full border rounded-lg p-2 text-sm">
          <option value="">— เลือกหน่วยงาน —</option>
          {orgsList.map(o => (
            <option key={o.id} value={o.org_code}>{o.name}</option>
          ))}
          <option value="OTHER">อื่นๆ โปรดระบุ...</option>
        </select>

        {orgOption === 'OTHER' && (
          <input 
            value={customOrg} 
            onChange={e => setCustomOrg(e.target.value)} 
            placeholder="โปรดระบุชื่อหน่วยงานของคุณ" 
            className="w-full border rounded-lg p-2 text-sm mt-1.5 focus:border-brand focus:ring-1 focus:ring-brand outline-none" 
          />
        )}

        {/* PDPA */}
        <div className="bg-gray-50 rounded-lg p-3 mt-4 text-[0.68rem] text-gray-500 leading-relaxed max-h-28 overflow-y-auto border">
          <strong className="text-brand">คำชี้แจง PDPA</strong><br />
          ข้อมูลที่กรอกจะถูกเก็บเพื่อการวิจัยและพัฒนาระบบ ข้อมูลระบุตัวตนจะถูกเข้ารหัส คุณมีสิทธิ์ขอยกเลิกได้ตลอดเวลา
        </div>
        <label className="flex items-start gap-2 mt-2 cursor-pointer">
          <input type="checkbox" checked={pdpa} onChange={e => setPdpa(e.target.checked)} className="mt-0.5" />
          <span className="text-xs text-gray-700">ยินยอมให้เก็บข้อมูลตามข้อตกลง <span className="text-red-500">*</span></span>
        </label>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mt-3 text-center text-[0.65rem] text-yellow-800">
          <strong className="text-orange-600">⚠️</strong> ผลประเมินเป็นสัญญาณเบื้องต้น ไม่ใช่การวินิจฉัยทางการแพทย์
        </div>

        <button onClick={doRegister} disabled={regLoading}
          className="w-full mt-4 py-3 rounded-xl bg-brand text-white font-bold text-sm disabled:bg-gray-400 hover:bg-brand-light transition-colors">
          {regLoading ? 'กำลังลงทะเบียน...' : 'เริ่มทำแบบประเมิน →'}
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: QUIZ
  // ═══════════════════════════════════════════════════════════
  if (phase === 'quiz') {
    if (!activeQs.length) return <div className="text-center py-20 text-gray-500">กำลังโหลดคำถาม...</div>;
    const q = activeQs[idx];
    if (!q) return null;
    const pct = Math.round((idx / activeQs.length) * 100);

    // Section transition
    let sectionMsg = null;
    if (q.section !== lastSection) {
      if (q.section !== lastSection && lastSection !== '') {
        // Update last section after render
        setTimeout(() => setLastSection(q.section), 0);
      } else if (lastSection === '') {
        setTimeout(() => setLastSection(q.section), 0);
      }

      if (q.section === 'D+') sectionMsg = '😊 ขอบคุณที่ตอบมาถึงตรงนี้นะ เราอยากเข้าใจคุณให้ลึกขึ้นอีกนิด';
      else if (q.section === 'E') sectionMsg = '🌿 เกือบเสร็จแล้ว! มาดูธาตุประจำตัวคุณกัน';
      else if (q.section !== 'A' && SEC_NAMES[q.section]) sectionMsg = `✦ ${SEC_NAMES[q.section]} ✦`;
    }

    const choiceKeys = ['A', 'B', 'C', 'D'].filter(k => q.choices[k as keyof typeof q.choices]);

    return (
      <div className="space-y-3">
        {/* Header */}
        <div className="bg-brand rounded-xl p-3.5 text-white">
          <h2 className="text-sm font-bold">KRUTH DEMM — {SEC_NAMES[q.section] || q.section}</h2>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-white/25 rounded-full">
              <div className="h-1.5 bg-amber-400 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-white/70 min-w-[32px] text-right">{pct}%</span>
          </div>
        </div>

        {/* Section message */}
        {sectionMsg && (
          <div className={`text-center text-sm p-3 rounded-lg ${q.section === 'D+' || q.section === 'E' ? 'bg-green-50 text-green-700' : 'text-gray-400'}`}>
            {sectionMsg}
          </div>
        )}

        {/* ═══ แถบข้อความเตือนใจทางจิตวิทยา ═══ */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mt-2 mb-2 shadow-sm animate-fade-in">
          <p className="text-sm text-indigo-800 text-center font-medium leading-relaxed">
            💡 <span className="opacity-80">เคล็ดลับ:</span> ตอบอย่างที่คุณจะทำและรู้สึกจริงๆ<br/>
            <span className="text-indigo-600 font-bold">จะทำให้การประเมินแม่นยำขึ้น</span>
          </p>
        </div>

        {/* Question card */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <p className="text-[0.65rem] text-gray-300 font-semibold mb-1">{q.q_id}</p>
          <p className="text-brand font-semibold leading-relaxed mb-4">{q.question}</p>

          <div className="space-y-2">
            {choiceKeys.map(k => (
              <button key={k} onClick={() => selectChoice(k)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left text-sm transition-all
                  ${selected === k ? 'border-brand bg-blue-50 text-brand font-semibold' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'}`}>
                <span className="text-xs font-bold text-gray-300 min-w-[18px]">{k}</span>
                {q.choices[k as keyof typeof q.choices]}
              </button>
            ))}
          </div>
        </div>

        {/* Next button */}
        <button onClick={nextQuestion} disabled={!selected}
          className="w-full py-3 rounded-xl bg-brand text-white font-bold text-sm disabled:bg-gray-300 hover:bg-brand-light transition-colors">
          {selected ? 'ถัดไป →' : 'เลือกคำตอบก่อน'}
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: SUBMITTING
  // ═══════════════════════════════════════════════════════════
  if (phase === 'submitting') {
    return (
      <div className="text-center py-20 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="text-6xl animate-bounce mb-6">🦅</div>
        <div className="w-10 h-10 border-3 border-blue-200 border-t-brand rounded-full animate-spin mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-[#1A3A5C] mb-2 animate-pulse">กำลังวิเคราะห์ตัวตนของคุณ...</h2>
        <p className="text-xs text-gray-400 mt-1 mb-8">อาจใช้เวลาสักครู่</p>
        
        {/* ═══ ข้อความปรัชญา ═══ */}
        <div className="mt-6 max-w-xs text-center">
          <p className="text-gray-500 italic text-sm leading-relaxed">
            "คนแบบที่คุณเป็น... <br/>
            อาจจะไม่ใช่ <strong className="text-indigo-400">ทุกอย่างที่เป็นคุณ</strong>"
          </p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: CRISIS / SOFT LANDING
  // ═══════════════════════════════════════════════════════════
  if (phase === 'crisis') {
    return (
      <div className="pt-8">
        <div className="bg-white rounded-2xl p-8 shadow-lg text-center max-w-md mx-auto">
          <div className="text-5xl mb-4">💙</div>
          <h2 className="text-brand text-xl font-bold mb-2">ขอบคุณที่ไว้ใจบอกเรานะ</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            เราเห็นว่าช่วงนี้คุณอาจกำลังผ่านช่วงเวลาที่ไม่ง่าย<br />
            และนั่นไม่ใช่ความผิดของคุณเลย<br /><br />
            <strong>คุณไม่ได้อยู่คนเดียว</strong>
          </p>

          {showBreathing && (
            <div className="bg-green-50 rounded-xl p-5 mb-4">
              <div className="w-20 h-20 rounded-full bg-green-400 mx-auto mb-3 flex items-center justify-center text-3xl text-white animate-[breathe_10s_ease-in-out_infinite]">
                😮‍💨
              </div>
              <p className="text-green-700 font-semibold text-sm">หายใจเข้า 4 วิ · ค้าง 4 วิ · หายใจออก 6 วิ</p>
            </div>
          )}

          <div className="space-y-2.5">
            <p className="text-sm text-gray-600 font-semibold">ตอนนี้คุณอยากทำอะไรต่อ?</p>

            <a href="tel:1323" className="block w-full py-3 px-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm hover:bg-blue-100 transition-colors">
              🫂 คุยกับคนที่พร้อมรับฟัง — โทร 1323<br />
              <span className="text-xs text-gray-400">(ฟรี 24 ชม. ไม่ต้องบอกชื่อจริง)</span>
            </a>

            <button onClick={() => setShowBreathing(true)}
              className="w-full py-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm hover:bg-blue-100">
              🌿 ทำกิจกรรมผ่อนคลายสักครู่
            </button>

            <button onClick={() => {
              setEncIdx(i => (i + 1) % ENCOURAGEMENTS.length);
              trackEvent('crisis_action', 'crisis', { action: 'encouragement' });
            }} className="w-full py-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm hover:bg-blue-100">
              💬 อ่านข้อความให้กำลังใจ
            </button>

            {/* Encouragement display */}
            <div className="bg-green-50 rounded-xl p-3 text-sm text-green-800 leading-relaxed">
              🌱 {ENCOURAGEMENTS[encIdx]}
            </div>

            <button onClick={crisisContinue}
              className="w-full py-3 rounded-xl bg-gray-100 border border-gray-200 text-gray-600 text-sm mt-2 hover:bg-gray-200">
              ➡️ ทำแบบทดสอบต่อ — ถ้าคุณพร้อม
            </button>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 mt-4 text-[0.65rem] text-yellow-800">
            เราจะเก็บทุกอย่างเป็นความลับ
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function QuizPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-gray-500">กำลังเตรียมแบบทดสอบ...</div>}>
      <QuizPageInner />
    </Suspense>
  );
}