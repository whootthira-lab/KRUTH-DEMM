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

  // ═══ ACCESSIBILITY STATE ═══
  const [accessibleMode, setAccessibleMode] = useState({
    visuallyImpaired: false,
    hearingImpaired: false,
    speechImpaired: false,
    highContrast: false,
    largeFont: false,
    voiceInteractive: false,
    signLanguageVideo: false,
  });

  const [isThaiVoiceAvailable, setIsThaiVoiceAvailable] = useState(true);
  const [forceVisualFallback, setForceVisualFallback] = useState(false);
  const [closedCaptionText, setClosedCaptionText] = useState('');
  const [isMicActive, setMicActive] = useState(false);
  const [visualFlash, setVisualFlash] = useState<'SUCCESS' | 'WARNING' | 'CRISIS' | null>(null);

  // Typing Analytics Variables
  const [typingStart, setTypingStart] = useState<number | null>(null);
  const [keypressCount, setKeypressCount] = useState(0);
  const [backspaceCount, setBackspaceCount] = useState(0);

  const voiceRestartTimeoutRef = useRef<any>(null);
  const recognitionInstanceRef = useRef<any>(null);
  const isVoiceInteractionActiveRef = useRef<boolean>(false);

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

  // Load accessibility settings from localStorage on client-side mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('kruth_accessible_mode');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setAccessibleMode(parsed);
        } catch (e) {
          console.error('Error parsing accessibility settings:', e);
        }
      }
    }
  }, []);

  // Save accessibility settings to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('kruth_accessible_mode', JSON.stringify(accessibleMode));
    }
  }, [accessibleMode]);

  // Set closed captions to current question when question loads
  useEffect(() => {
    if (phase === 'quiz' && activeQs[idx]) {
      setClosedCaptionText(activeQs[idx].question);
    }
  }, [phase, idx, activeQs]);

  useEffect(() => { 
    trackPageView('/quiz'); 
    loadRegions(); 
    loadOrganizations();
  }, []);

  // ═══ ACCESSIBILITY HELPERS & HOOKS ═══
  const cleanUpVoiceSpeechAPI = useCallback(() => {
    isVoiceInteractionActiveRef.current = false;
    if (voiceRestartTimeoutRef.current) {
      clearTimeout(voiceRestartTimeoutRef.current);
      voiceRestartTimeoutRef.current = null;
    }
    if (recognitionInstanceRef.current) {
      try { recognitionInstanceRef.current.stop(); } catch (e) {}
      recognitionInstanceRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setMicActive(false);
    setClosedCaptionText('');
  }, []);

  const triggerHapticAlert = useCallback((patternType: 'SUCCESS' | 'WARNING' | 'CRISIS') => {
    let pattern = [200];
    if (patternType === 'SUCCESS') {
      pattern = [100, 50, 100];
    } else if (patternType === 'WARNING' || patternType === 'CRISIS') {
      pattern = [500, 100, 500];
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    } else {
      setVisualFlash(patternType);
      setTimeout(() => {
        setVisualFlash(null);
      }, 500);
    }
  }, []);

  const toggleAccessibility = (key: keyof typeof accessibleMode) => {
    setAccessibleMode(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      if (key === 'visuallyImpaired') {
        updated.voiceInteractive = !prev.visuallyImpaired;
        updated.largeFont = !prev.visuallyImpaired;
        updated.highContrast = !prev.visuallyImpaired;
      }
      if (key === 'hearingImpaired') {
        updated.signLanguageVideo = !prev.hearingImpaired;
      }
      return updated;
    });
  };

  const handleTypingKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!typingStart) {
      setTypingStart(Date.now());
    }
    setKeypressCount(c => c + 1);
    if (e.key === 'Backspace') {
      setBackspaceCount(bc => bc + 1);
    }
  };

  // Voice capabilities check
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setForceVisualFallback(true);
      return;
    }

    const checkVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const hasThai = voices.some(voice => voice.lang === 'th-TH' || voice.lang.includes('th'));
      setIsThaiVoiceAvailable(hasThai);
      if (!hasThai && accessibleMode.visuallyImpaired) {
        setForceVisualFallback(true);
      }
    };

    window.speechSynthesis.onvoiceschanged = checkVoices;
    checkVoices();

    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [accessibleMode.visuallyImpaired]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanUpVoiceSpeechAPI();
    };
  }, [cleanUpVoiceSpeechAPI]);

  const speakChoices = useCallback((choices: string[], choiceIdx: number, onFinish: () => void) => {
    if (choiceIdx >= choices.length || !isVoiceInteractionActiveRef.current) {
      if (isVoiceInteractionActiveRef.current) {
        onFinish();
      }
      return;
    }

    const labels = ['เอ', 'บี', 'ซี', 'ดี'];
    const textToSpeak = `ตัวเลือก ${labels[choiceIdx]}: ${choices[choiceIdx]}`;
    const utter = new SpeechSynthesisUtterance(textToSpeak);
    utter.lang = 'th-TH';

    utter.onstart = () => {
      setClosedCaptionText(textToSpeak);
    };

    utter.onend = () => {
      speakChoices(choices, choiceIdx + 1, onFinish);
    };

    utter.onerror = () => {
      speakChoices(choices, choiceIdx + 1, onFinish);
    };

    window.speechSynthesis.speak(utter);
  }, []);

  const speakCurrentQuestion = useCallback((q: Question) => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !accessibleMode.voiceInteractive || forceVisualFallback) return;

    cleanUpVoiceSpeechAPI();
    isVoiceInteractionActiveRef.current = true;

    const choicesArray = [q.choices.A, q.choices.B, q.choices.C, q.choices.D].filter(Boolean);
    const textToSpeak = `คำถามคือ: ${q.question}`;
    const utter = new SpeechSynthesisUtterance(textToSpeak);
    utter.lang = 'th-TH';

    utter.onstart = () => {
      setClosedCaptionText(textToSpeak);
    };

    utter.onend = () => {
      speakChoices(choicesArray, 0, () => {
        startVoiceRecognition();
      });
    };

    utter.onerror = () => {
      speakChoices(choicesArray, 0, () => {
        startVoiceRecognition();
      });
    };

    window.speechSynthesis.speak(utter);
  }, [accessibleMode.voiceInteractive, forceVisualFallback, cleanUpVoiceSpeechAPI, speakChoices]);

  const startVoiceRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition || !accessibleMode.voiceInteractive) return;

    isVoiceInteractionActiveRef.current = true;
    const recognition = new SpeechRecognition();
    recognitionInstanceRef.current = recognition;

    recognition.lang = 'th-TH';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setMicActive(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.trim().toLowerCase();
      let selectedChoice = null;

      if (transcript.includes('เอ') || transcript.includes('ก') || transcript.includes('ข้อหนึ่ง') || transcript.includes('ข้อ 1')) {
        selectedChoice = 'A';
      } else if (transcript.includes('บี') || transcript.includes('ข') || transcript.includes('ข้อสอง') || transcript.includes('ข้อ 2')) {
        selectedChoice = 'B';
      } else if (transcript.includes('ซี') || transcript.includes('ค') || transcript.includes('ข้อสาม') || transcript.includes('ข้อ 3')) {
        selectedChoice = 'C';
      } else if (transcript.includes('ดี') || transcript.includes('ง') || transcript.includes('ข้อสี่') || transcript.includes('ข้อ 4')) {
        selectedChoice = 'D';
      }

      if (selectedChoice) {
        isVoiceInteractionActiveRef.current = false;
        recognition.stop();
        selectChoice(selectedChoice);
        triggerHapticAlert('SUCCESS');
        setTimeout(() => {
          nextQuestion();
        }, 1000);
      } else {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance("ขออภัยค่ะ โปรดเลือก เอ บี ซี หรือ ดี ค่ะ");
          utter.lang = 'th-TH';
          utter.onend = () => {
            if (isVoiceInteractionActiveRef.current) {
              try { recognition.start(); } catch(e){}
            }
          };
          window.speechSynthesis.speak(utter);
        }
      }
    };

    recognition.onend = () => {
      setMicActive(false);
      if (isVoiceInteractionActiveRef.current) {
        if (voiceRestartTimeoutRef.current) clearTimeout(voiceRestartTimeoutRef.current);
        voiceRestartTimeoutRef.current = setTimeout(() => {
          try { recognition.start(); } catch (e) {}
        }, 300);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech Recognition Error:", event.error);
      if (isVoiceInteractionActiveRef.current && event.error !== 'not-allowed') {
        if (voiceRestartTimeoutRef.current) clearTimeout(voiceRestartTimeoutRef.current);
        voiceRestartTimeoutRef.current = setTimeout(() => {
          try { recognition.start(); } catch (e) {}
        }, 500);
      }
    };

    try {
      recognition.start();
    } catch (e: any) {
      console.warn("Could not start recognition:", e.message);
    }
  };

  // Speak question effect
  useEffect(() => {
    if (phase === 'quiz' && activeQs[idx]) {
      speakCurrentQuestion(activeQs[idx]);
    }
    return () => {
      cleanUpVoiceSpeechAPI();
    };
  }, [phase, idx, activeQs, speakCurrentQuestion, cleanUpVoiceSpeechAPI]);

  const getBehavioralMetrics = () => {
    const elapsed = typingStart ? Date.now() - typingStart : 0;
    const durationMin = elapsed > 0 ? elapsed / 60000 : 0;
    const typingSpeedCpm = durationMin > 0 ? Math.round(keypressCount / durationMin) : 0;
    const backspaceRatio = keypressCount > 0 ? backspaceCount / keypressCount : 0;

    const validLatencies = answers.filter(a => a.latency_ms > 0).map(a => a.latency_ms);
    const averageFocusToClickLatencyMs = validLatencies.length > 0
      ? Math.round(validLatencies.reduce((sum, val) => sum + val, 0) / validLatencies.length)
      : 0;

    return {
      typingSpeedCpm,
      backspaceCount,
      backspaceRatio: parseFloat(backspaceRatio.toFixed(3)),
      averageFocusToClickLatencyMs
    };
  };

  const renderAccessibilityPanel = () => {
    return (
      <div className={`p-4 rounded-2xl shadow-sm border transition-all duration-300 mb-4 ${
        accessibleMode.highContrast ? 'bg-black border-yellow-400 text-yellow-400 font-sans' : 'bg-gray-50 border-gray-100 text-gray-700'
      }`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">♿</span>
          <h3 className="font-bold text-sm">สิ่งอำนวยความสะดวกสำหรับผู้พิการ (Accessibility Panel)</h3>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => toggleAccessibility('visuallyImpaired')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              accessibleMode.visuallyImpaired
                ? (accessibleMode.highContrast ? 'bg-yellow-400 text-black border-yellow-400' : 'bg-[#1D8B75] text-white border-[#1D8B75]')
                : (accessibleMode.highContrast ? 'bg-black text-yellow-400 border-yellow-400' : 'bg-white border-gray-200')
            }`}
          >
            👓 บกพร่องทางการมองเห็น (เสียงช่วยอ่าน/นำทาง)
          </button>
          <button
            type="button"
            onClick={() => toggleAccessibility('hearingImpaired')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              accessibleMode.hearingImpaired
                ? (accessibleMode.highContrast ? 'bg-yellow-400 text-black border-yellow-400' : 'bg-[#1D8B75] text-white border-[#1D8B75]')
                : (accessibleMode.highContrast ? 'bg-black text-yellow-400 border-yellow-400' : 'bg-white border-gray-200')
            }`}
          >
            🧏 บกพร่องทางการได้ยิน (ภาษามือ/ซับ CC)
          </button>
          <button
            type="button"
            onClick={() => toggleAccessibility('speechImpaired')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              accessibleMode.speechImpaired
                ? (accessibleMode.highContrast ? 'bg-yellow-400 text-black border-yellow-400' : 'bg-[#1D8B75] text-white border-[#1D8B75]')
                : (accessibleMode.highContrast ? 'bg-black text-yellow-400 border-yellow-400' : 'bg-white border-gray-200')
            }`}
          >
            🙊 บกพร่องทางการพูด (วิเคราะห์การพิมพ์แทนเสียง)
          </button>
        </div>

        {(accessibleMode.visuallyImpaired || accessibleMode.hearingImpaired) && (
          <div className="mt-3 pt-3 border-t border-dashed border-gray-200/50 flex flex-wrap gap-2.5">
            {accessibleMode.visuallyImpaired && (
              <>
                <button
                  type="button"
                  onClick={() => toggleAccessibility('largeFont')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${
                    accessibleMode.largeFont ? 'bg-yellow-200 text-gray-800' : 'bg-white text-gray-500'
                  }`}
                >
                  🔎 ตัวอักษรใหญ่พิเศษ
                </button>
                <button
                  type="button"
                  onClick={() => toggleAccessibility('highContrast')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${
                    accessibleMode.highContrast ? 'bg-yellow-200 text-gray-800' : 'bg-white text-gray-500'
                  }`}
                >
                  🌓 โหมดสีคมชัดสูง (7:1)
                </button>
              </>
            )}
            {accessibleMode.hearingImpaired && (
              <button
                type="button"
                onClick={() => toggleAccessibility('signLanguageVideo')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${
                  accessibleMode.signLanguageVideo ? 'bg-yellow-200 text-gray-800' : 'bg-white text-gray-500'
                }`}
              >
                🤟 วิดีโอภาษามือประกอบคำถาม
              </button>
            )}
          </div>
        )}
      </div>
    );
  };


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
      triggerHapticAlert('WARNING');
      setRegErr('กรุณากรอกข้อมูลให้ครบทุกช่อง'); return;
    }
    
    // ตรวจสอบข้อมูลหน่วยงาน
    const orgNameToSend = orgOption === 'OTHER' ? customOrg.trim() : (orgsList.find(o => o.org_code === orgOption)?.name || '');
    if (!orgOption || (orgOption === 'OTHER' && !orgNameToSend)) {
      triggerHapticAlert('WARNING');
      setRegErr('กรุณาเลือกหรือระบุหน่วยงานของคุณ'); return;
    }

    if (idcard && idcard.length !== 13) { 
      triggerHapticAlert('WARNING');
      setRegErr('เลขบัตรประชาชนต้อง 13 หลัก'); return; 
    }
    if (!pdpa) { 
      triggerHapticAlert('WARNING');
      setRegErr('กรุณายินยอม PDPA ก่อนทำแบบประเมิน'); return; 
    }

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
      triggerHapticAlert('WARNING');
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
      const finalMetrics = getBehavioralMetrics();
      const res = await fetch('/api/score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dvjId, band, answers: finalAnswers, sessionId,
          behavioralMetrics: finalMetrics
        }),
      });
      const data = await res.json();
      if (data.ok && !isCrisis) {
        trackEvent('quiz_completed', 'quiz', {
          duration_sec: Math.round(finalAnswers.reduce((s, a) => s + a.latency_ms, 0) / 1000),
          questions_answered: finalAnswers.length,
          typing_speed_cpm: finalMetrics.typingSpeedCpm,
          backspace_count: finalMetrics.backspaceCount,
          backspace_ratio: finalMetrics.backspaceRatio
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
      <div className={`w-full max-w-md mx-auto p-4 transition-all duration-300 min-h-screen ${
        accessibleMode.highContrast ? 'bg-black text-yellow-400 font-sans' : 'bg-gray-100 text-gray-800'
      }`}>
        {renderAccessibilityPanel()}
        <div className={`rounded-2xl p-6 shadow-lg border transition-all duration-300 ${
          accessibleMode.highContrast ? 'bg-black border-yellow-400 text-yellow-400' : 'bg-white border-gray-100 text-gray-700'
        }`}>
          {visualFlash && (
            <div className={`fixed inset-0 z-50 pointer-events-none transition-all duration-300 ${
              visualFlash === 'SUCCESS' ? 'bg-green-500/20' : 'bg-red-500/25'
            }`} />
          )}
          <button onClick={() => router.push('/')}
            className={`text-xs underline mb-3 block text-left ${accessibleMode.highContrast ? 'text-yellow-400' : 'text-brand'}`}>
            ← เลือกช่วงอายุใหม่
          </button>
          <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full mb-3 ${
            accessibleMode.highContrast ? 'bg-yellow-400 text-black' : 'bg-brand text-white'
          }`}>
            Band {band} — {info?.name}
          </span>
          <h2 className={`font-bold mb-1 ${accessibleMode.largeFont || forceVisualFallback ? 'text-xl' : 'text-lg'} ${accessibleMode.highContrast ? 'text-yellow-400' : 'text-brand'}`}>
            ลงทะเบียนก่อนทำแบบประเมิน
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            กรุณากรอกข้อมูลให้ครบถ้วน <span className="text-red-500">*</span> = จำเป็น
          </p>

          {regErr && (
            <div className={`text-xs p-2.5 rounded-lg mb-3 ${
              accessibleMode.highContrast ? 'bg-yellow-400/20 border border-yellow-400 text-yellow-300' : 'bg-red-50 text-red-600'
            }`}>
              {regErr}
            </div>
          )}

          <label className="text-xs font-semibold block mt-3 mb-1">
            วันเกิด <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <select value={day} onChange={e => setDay(e.target.value)}
              className={`border rounded-lg p-2 text-sm ${
                accessibleMode.highContrast ? 'bg-black border-yellow-400 text-yellow-400' : 'bg-white'
              }`}>
              <option value="">วัน</option>
              {Array.from({length: 31}, (_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
            </select>
            <select value={month} onChange={e => setMonth(e.target.value)}
              className={`border rounded-lg p-2 text-sm ${
                accessibleMode.highContrast ? 'bg-black border-yellow-400 text-yellow-400' : 'bg-white'
              }`}>
              <option value="">เดือน</option>
              {['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'].map((m, i) =>
                <option key={i+1} value={i+1}>{m}</option>)}
            </select>
            <input type="number" placeholder="ปี ค.ศ. (เช่น 1986 , 2003)" value={year}
              onKeyDown={handleTypingKeydown}
              onChange={e => { setYear(e.target.value); if(e.target.value) setKeypressCount(c => c + 1); }}
              className={`border rounded-lg p-2 text-sm ${
                accessibleMode.highContrast ? 'bg-black border-yellow-400 text-yellow-400' : 'bg-white'
              }`} min="1944" max="2020" />
          </div>

          <label className="text-xs font-semibold block mt-3 mb-1">
            ชื่อ <span className="text-red-500">*</span>
          </label>
          <input value={fname}
            onKeyDown={handleTypingKeydown}
            onChange={e => { setFname(e.target.value); if(e.target.value) setKeypressCount(c => c + 1); }}
            placeholder="ชื่อจริง (เพื่อคำนวณธาตุประกอบ)"
            className={`w-full border rounded-lg p-2 text-sm ${
              accessibleMode.highContrast ? 'bg-black border-yellow-400 text-yellow-400' : 'bg-white'
            }`} />

          <label className="text-xs font-semibold block mt-3 mb-1">
            นามสกุล <span className="text-red-500">*</span>
          </label>
          <input value={lname}
            onKeyDown={handleTypingKeydown}
            onChange={e => { setLname(e.target.value); if(e.target.value) setKeypressCount(c => c + 1); }}
            placeholder="นามสกุล (เพื่อคำนวณธาตุประกอบ)"
            className={`w-full border rounded-lg p-2 text-sm ${
              accessibleMode.highContrast ? 'bg-black border-yellow-400 text-yellow-400' : 'bg-white'
            }`} />

          <label className="text-xs font-semibold block mt-3 mb-1">
            เพศ <span className="text-red-500">*</span>
          </label>
          <select value={gender} onChange={e => setGender(e.target.value)}
            className={`w-full border rounded-lg p-2 text-sm ${
              accessibleMode.highContrast ? 'bg-black border-yellow-400 text-yellow-400' : 'bg-white'
            }`}>
            <option value="">— เลือก —</option>
            <option value="M">ชาย</option><option value="F">หญิง</option><option value="O">อื่นๆ</option>
          </select>

          <label className="text-xs font-semibold block mt-3 mb-1">ภูมิภาค</label>
          <select onChange={e => { loadProvinces(e.target.value); }}
            className={`w-full border rounded-lg p-2 text-sm ${
              accessibleMode.highContrast ? 'bg-black border-yellow-400 text-yellow-400' : 'bg-white'
            }`}>
            <option value="">— เลือกภาค —</option>
            <option value="">ทั้งหมด</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <label className="text-xs font-semibold block mt-3 mb-1">
            จังหวัด <span className="text-red-500">*</span>
          </label>
          <select value={province} onChange={e => setProvince(e.target.value)}
            className={`w-full border rounded-lg p-2 text-sm ${
              accessibleMode.highContrast ? 'bg-black border-yellow-400 text-yellow-400' : 'bg-white'
            }`}>
            <option value="">— เลือกจังหวัด —</option>
            {provinces.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <label className="text-xs font-semibold block mt-3 mb-1">
            หน่วยงาน / โรงเรียน <span className="text-red-500">*</span>
          </label>
          <select value={orgOption} onChange={e => setOrgOption(e.target.value)}
            className={`w-full border rounded-lg p-2 text-sm ${
              accessibleMode.highContrast ? 'bg-black border-yellow-400 text-yellow-400' : 'bg-white'
            }`}>
            <option value="">— เลือกหน่วยงาน —</option>
            {orgsList.map(o => (
              <option key={o.id} value={o.org_code}>{o.name}</option>
            ))}
            <option value="OTHER">อื่นๆ โปรดระบุ...</option>
          </select>

          {orgOption === 'OTHER' && (
            <input 
              value={customOrg} 
              onKeyDown={handleTypingKeydown}
              onChange={e => { setCustomOrg(e.target.value); if(e.target.value) setKeypressCount(c => c + 1); }}
              placeholder="โปรดระบุชื่อหน่วยงานของคุณ" 
              className={`w-full border rounded-lg p-2 text-sm mt-1.5 outline-none ${
                accessibleMode.highContrast
                  ? 'bg-black border-yellow-400 text-yellow-400 focus:border-yellow-300'
                  : 'focus:border-brand focus:ring-1 focus:ring-brand'
              }`}
            />
          )}

          {/* PDPA */}
          <div className={`rounded-lg p-3 mt-4 text-[0.68rem] leading-relaxed max-h-28 overflow-y-auto border ${
            accessibleMode.highContrast ? 'bg-black border-yellow-500 text-yellow-500' : 'bg-gray-50 text-gray-500'
          }`}>
            <strong className={accessibleMode.highContrast ? 'text-yellow-400' : 'text-brand'}>คำชี้แจง PDPA</strong><br />
            ข้อมูลที่กรอกจะถูกเก็บเพื่อการวิจัยและพัฒนาระบบ ข้อมูลระบุตัวตนจะถูกเข้ารหัส คุณมีสิทธิ์ขอยกเลิกได้ตลอดเวลา
          </div>
          <label className="flex items-start gap-2 mt-2 cursor-pointer">
            <input type="checkbox" checked={pdpa} onChange={e => setPdpa(e.target.checked)} className="mt-0.5" />
            <span className="text-xs">ยินยอมให้เก็บข้อมูลตามข้อตกลง <span className="text-red-500">*</span></span>
          </label>

          <div className={`border rounded-lg p-2 mt-3 text-center text-[0.65rem] ${
            accessibleMode.highContrast ? 'bg-black border-yellow-500 text-yellow-500' : 'bg-yellow-50 border-yellow-200 text-yellow-800'
          }`}>
            <strong className="text-orange-600">⚠️</strong> ผลประเมินเป็นสัญญาณเบื้องต้น ไม่ใช่การวินิจฉัยทางการแพทย์
          </div>

          <button onClick={doRegister} disabled={regLoading}
            className={`w-full mt-4 py-3 rounded-xl font-bold transition-colors ${
              accessibleMode.highContrast
                ? 'bg-yellow-400 text-black border-2 border-yellow-400 font-extrabold hover:bg-yellow-300'
                : 'bg-brand text-white hover:bg-brand-light disabled:bg-gray-400'
            } ${accessibleMode.largeFont || forceVisualFallback ? 'text-base py-4' : 'text-sm'}`}>
            {regLoading ? 'กำลังลงทะเบียน...' : 'เริ่มทำแบบประเมิน →'}
          </button>
        </div>
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
      <div className={`w-full max-w-md mx-auto p-4 transition-all duration-300 min-h-screen ${
        accessibleMode.highContrast ? 'bg-black text-yellow-400 font-sans' : 'bg-gray-100 text-gray-800'
      }`}>
        {renderAccessibilityPanel()}
        {visualFlash && (
          <div className={`fixed inset-0 z-50 pointer-events-none transition-all duration-300 ${
            visualFlash === 'SUCCESS' ? 'bg-green-500/20' : 'bg-red-500/25'
          }`} />
        )}

        <div className={`rounded-2xl p-6 shadow-lg border transition-all duration-300 space-y-4 ${
          accessibleMode.highContrast ? 'bg-black border-yellow-400 text-yellow-400' : 'bg-white border-gray-100 text-gray-700'
        }`}>
          {/* Header */}
          <div className={`rounded-xl p-3.5 transition-all duration-300 ${
            accessibleMode.highContrast ? 'bg-black border border-yellow-400 text-yellow-400' : 'bg-brand text-white'
          }`} role="banner">
            <h2 className={`font-bold ${accessibleMode.largeFont ? 'text-lg' : 'text-sm'}`}>
              KRUTH DEMM — {SEC_NAMES[q.section] || q.section}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <div className={`flex-1 h-1.5 rounded-full ${
                accessibleMode.highContrast ? 'bg-yellow-400/20' : 'bg-white/25'
              }`}>
                <div 
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    accessibleMode.highContrast ? 'bg-yellow-400' : 'bg-amber-400'
                  }`} 
                  style={{ width: `${pct}%` }} 
                  role="progressbar" 
                  aria-valuenow={pct} 
                  aria-valuemin={0} 
                  aria-valuemax={100}
                />
              </div>
              <span className={`min-w-[32px] text-right ${accessibleMode.largeFont ? 'text-sm' : 'text-xs'}`}>{pct}%</span>
            </div>
          </div>

          {/* Section message */}
          {sectionMsg && (
            <div 
              className={`text-center p-3 rounded-lg border transition-all duration-300 ${
                accessibleMode.highContrast 
                  ? 'bg-black border-yellow-400/50 text-yellow-300' 
                  : (q.section === 'D+' || q.section === 'E' ? 'bg-green-50 border-green-100 text-green-700' : 'bg-gray-50 border-gray-100 text-gray-400')
              } ${accessibleMode.largeFont ? 'text-base font-semibold' : 'text-sm'}`}
            >
              {sectionMsg}
            </div>
          )}

          {/* ═══ แถบข้อความเตือนใจทางจิตวิทยา ═══ */}
          <div className={`rounded-xl p-3 mt-2 mb-2 shadow-sm animate-fade-in border transition-all duration-300 ${
            accessibleMode.highContrast 
              ? 'bg-black border-yellow-400 text-yellow-400' 
              : 'bg-indigo-50 border-indigo-100 text-indigo-800'
          }`}>
            <p className={`text-center font-medium leading-relaxed ${accessibleMode.largeFont ? 'text-base' : 'text-sm'}`}>
              💡 <span>เคล็ดลับ:</span> ตอบอย่างที่คุณจะทำและรู้สึกจริงๆ<br/>
              <span className={accessibleMode.highContrast ? 'text-yellow-300 underline font-bold' : 'text-indigo-600 font-bold'}>
                จะทำให้การประเมินแม่นยำขึ้น
              </span>
            </p>
          </div>

          {/* Sign Language Video (Hearing Impaired Feature) */}
          {accessibleMode.hearingImpaired && accessibleMode.signLanguageVideo && q.sign_language_video_url && (
            <div className={`w-full rounded-xl overflow-hidden border flex justify-center bg-black transition-all duration-300 ${
              accessibleMode.highContrast ? 'border-yellow-400' : 'border-gray-200'
            }`}>
              <video
                src={q.sign_language_video_url}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className="w-full max-h-[220px] object-contain"
                aria-label="วิดีโอภาษามืออธิบายคำถามนี้"
              />
            </div>
          )}

          {/* Question card */}
          <div className={`rounded-xl p-5 border transition-all duration-300 ${
            accessibleMode.highContrast ? 'bg-black border-yellow-400/30' : 'bg-white border-0'
          }`} role="main">
            <p className={`font-semibold mb-1 ${
              accessibleMode.highContrast ? 'text-yellow-400/60' : 'text-gray-300'
            } ${accessibleMode.largeFont ? 'text-xs' : 'text-[0.65rem]'}`}>{q.q_id}</p>
            
            <h1 className={`font-bold leading-relaxed mb-4 ${
              accessibleMode.highContrast ? 'text-yellow-400' : 'text-brand'
            } ${accessibleMode.largeFont ? 'text-xl' : 'text-base'}`}>
              {q.question}
            </h1>

            <div className="space-y-2" role="radiogroup" aria-label="ตัวเลือกคำตอบ">
              {choiceKeys.map(k => {
                const isSel = selected === k;
                let btnClass = "";
                if (accessibleMode.highContrast) {
                  btnClass = isSel
                    ? "bg-yellow-400 text-black border-yellow-400 font-extrabold"
                    : "bg-black text-yellow-400 border-yellow-400 hover:bg-yellow-400/10";
                } else {
                  btnClass = isSel
                    ? "border-brand bg-blue-50 text-brand font-semibold"
                    : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 text-gray-700";
                }
                const labelClass = accessibleMode.highContrast
                  ? (isSel ? "text-black" : "text-yellow-400/60")
                  : "text-gray-300";
                return (
                  <button 
                    key={k} 
                    onClick={() => selectChoice(k)}
                    role="radio"
                    aria-checked={isSel}
                    aria-label={`ตัวเลือก ${k}: ${q.choices[k as keyof typeof q.choices]}`}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${btnClass} ${
                      accessibleMode.largeFont ? 'text-lg py-4' : 'text-sm'
                    }`}
                  >
                    <span className={`font-bold min-w-[18px] ${labelClass} ${accessibleMode.largeFont ? 'text-base' : 'text-xs'}`}>{k}</span>
                    <span>{q.choices[k as keyof typeof q.choices]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Next button */}
          <button 
            onClick={nextQuestion} 
            disabled={!selected}
            aria-label={selected ? "ส่งคำตอบและไปที่คำถามถัดไป" : "กรุณาเลือกคำตอบก่อนส่ง"}
            className={`w-full py-3 rounded-xl font-bold transition-colors ${
              accessibleMode.highContrast
                ? (selected 
                    ? 'bg-yellow-400 text-black border border-yellow-400 font-extrabold hover:bg-yellow-300' 
                    : 'bg-black text-yellow-400/40 border border-yellow-400/40 cursor-not-allowed')
                : 'bg-brand text-white hover:bg-brand-light disabled:bg-gray-300'
            } ${accessibleMode.largeFont ? 'text-lg py-4' : 'text-sm'}`}
          >
            {selected ? 'ถัดไป →' : 'เลือกคำตอบก่อน'}
          </button>
        </div>

        {/* Closed Caption Box */}
        {accessibleMode.hearingImpaired && closedCaptionText && (
          <div 
            className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-center shadow-2xl border max-w-[90%] w-full transition-all duration-300 ${
              accessibleMode.highContrast 
                ? 'bg-black border-yellow-400 text-yellow-400 font-bold' 
                : 'bg-gray-900/95 border-gray-800 text-white'
            }`}
            aria-live="polite"
          >
            <span className="text-[10px] uppercase tracking-wider block opacity-60 mb-0.5">Closed Captions</span>
            <p className={accessibleMode.largeFont ? 'text-base font-medium' : 'text-xs font-normal'}>{closedCaptionText}</p>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: SUBMITTING
  // ═══════════════════════════════════════════════════════════
  if (phase === 'submitting') {
    return (
      <div className={`w-full max-w-md mx-auto p-4 transition-all duration-300 min-h-screen flex flex-col items-center justify-center ${
        accessibleMode.highContrast ? 'bg-black text-yellow-400 font-sans' : 'bg-gray-100 text-gray-800'
      }`}>
        <div className={`rounded-2xl p-8 shadow-lg border transition-all duration-300 text-center max-w-md w-full ${
          accessibleMode.highContrast ? 'bg-black border-yellow-400 text-yellow-400' : 'bg-white border-gray-100 text-gray-700'
        }`}>
          <div className="text-6xl animate-bounce mb-6">🦅</div>
          <div className={`w-10 h-10 border-4 rounded-full animate-spin mx-auto mb-4 ${
            accessibleMode.highContrast ? 'border-yellow-400/20 border-t-yellow-400' : 'border-blue-200 border-t-brand'
          }`} />
          <h2 className={`font-bold mb-2 animate-pulse ${accessibleMode.largeFont ? 'text-3xl' : 'text-2xl'} ${accessibleMode.highContrast ? 'text-yellow-400' : 'text-[#1A3A5C]'}`}>
            กำลังวิเคราะห์ตัวตนของคุณ...
          </h2>
          <p className={`text-xs mt-1 mb-8 ${accessibleMode.highContrast ? 'text-yellow-400/60' : 'text-gray-400'}`}>
            อาจใช้เวลาสักครู่
          </p>
          
          {/* ═══ ข้อความปรัชญา ═══ */}
          <div className="mt-6 max-w-xs mx-auto text-center">
            <p className={`italic text-sm leading-relaxed ${accessibleMode.highContrast ? 'text-yellow-400' : 'text-gray-500'}`}>
              "คนแบบที่คุณเป็น... <br/>
              อาจจะไม่ใช่ <strong className={accessibleMode.highContrast ? 'text-yellow-300' : 'text-indigo-400'}>ทุกอย่างที่เป็นคุณ</strong>"
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: CRISIS / SOFT LANDING
  // ═══════════════════════════════════════════════════════════
  if (phase === 'crisis') {
    return (
      <div className={`w-full max-w-md mx-auto p-4 transition-all duration-300 min-h-screen ${
        accessibleMode.highContrast ? 'bg-black text-yellow-400 font-sans' : 'bg-gray-100 text-gray-800'
      }`}>
        {renderAccessibilityPanel()}
        <div className={`rounded-2xl p-8 shadow-lg border transition-all duration-300 text-center max-w-md mx-auto ${
          accessibleMode.highContrast ? 'bg-black border-yellow-400 text-yellow-400' : 'bg-white border-gray-100 text-gray-700'
        }`}>
          <div className="text-5xl mb-4">💙</div>
          <h2 className={`font-bold mb-2 ${accessibleMode.largeFont ? 'text-2xl' : 'text-xl'} ${accessibleMode.highContrast ? 'text-yellow-400' : 'text-brand'}`}>
            ขอบคุณที่ไว้ใจบอกเรานะ
          </h2>
          <p className={`text-sm leading-relaxed mb-6 ${accessibleMode.highContrast ? 'text-yellow-400' : 'text-gray-500'}`}>
            เราเห็นว่าช่วงนี้คุณอาจกำลังผ่านช่วงเวลาที่ไม่ง่าย<br />
            และนั่นไม่ใช่ความผิดของคุณเลย<br /><br />
            <strong>คุณไม่ได้อยู่คนเดียว</strong>
          </p>

          {showBreathing && (
            <div className={`rounded-xl p-5 mb-4 border ${
              accessibleMode.highContrast ? 'bg-black border-yellow-400 text-yellow-400' : 'bg-green-50 border-green-100 text-green-700'
            }`}>
              <div className="w-20 h-20 rounded-full bg-green-400 mx-auto mb-3 flex items-center justify-center text-3xl text-white animate-[breathe_10s_ease-in-out_infinite]">
                😮‍💨
              </div>
              <p className="font-semibold text-sm">หายใจเข้า 4 วิ · ค้าง 4 วิ · หายใจออก 6 วิ</p>
            </div>
          )}

          <div className="space-y-2.5">
            <p className={`text-sm font-semibold ${accessibleMode.highContrast ? 'text-yellow-400' : 'text-gray-600'}`}>
              ตอนนี้คุณอยากทำอะไรต่อ?
            </p>

            <a href="tel:1323" className={`block w-full py-3 px-4 rounded-xl border text-sm transition-colors ${
              accessibleMode.highContrast 
                ? 'bg-black border-yellow-400 text-yellow-400 hover:bg-yellow-400/10' 
                : 'bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100'
            }`}>
              🫂 คุยกับคนที่พร้อมรับฟัง — โทร 1323<br />
              <span className={`text-xs ${accessibleMode.highContrast ? 'text-yellow-400/60' : 'text-gray-400'}`}>
                (ฟรี 24 ชม. ไม่ต้องบอกชื่อจริง)
              </span>
            </a>

            <button onClick={() => setShowBreathing(true)}
              className={`w-full py-3 rounded-xl border text-sm transition-colors ${
                accessibleMode.highContrast 
                  ? 'bg-black border-yellow-400 text-yellow-400 hover:bg-yellow-400/10' 
                  : 'bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100'
              }`}>
              🌿 ทำกิจกรรมผ่อนคลายสักครู่
            </button>

            <button onClick={() => {
              setEncIdx(i => (i + 1) % ENCOURAGEMENTS.length);
              trackEvent('crisis_action', 'crisis', { action: 'encouragement' });
            }} className={`w-full py-3 rounded-xl border text-sm transition-colors ${
              accessibleMode.highContrast 
                ? 'bg-black border-yellow-400 text-yellow-400 hover:bg-yellow-400/10' 
                : 'bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100'
            }`}>
              💬 อ่านข้อความให้กำลังใจ
            </button>

            {/* Encouragement display */}
            <div className={`rounded-xl p-3 text-sm leading-relaxed border ${
              accessibleMode.highContrast ? 'bg-black border-yellow-400 text-yellow-400' : 'bg-green-50 border-green-100 text-green-850 font-medium'
            }`}>
              🌱 {ENCOURAGEMENTS[encIdx]}
            </div>

            <button onClick={crisisContinue}
              className={`w-full py-3 rounded-xl border text-sm mt-2 transition-colors ${
                accessibleMode.highContrast 
                  ? 'bg-yellow-400 text-black border-yellow-400 font-bold hover:bg-yellow-300' 
                  : 'bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200'
              }`}>
              ➡️ ทำแบบทดสอบต่อ — ถ้าคุณพร้อม
            </button>
          </div>

          <div className={`border rounded-lg p-2.5 mt-4 text-[0.65rem] ${
            accessibleMode.highContrast ? 'bg-black border-yellow-400 text-yellow-400/60' : 'bg-yellow-50 border-yellow-200 text-yellow-800'
          }`}>
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