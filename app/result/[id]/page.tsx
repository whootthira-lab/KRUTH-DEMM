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

  // 👥 Subgroup state
  const [subgroupData, setSubgroupData] = useState<{
    orgName: string;
    sessionName: string;
    sessionId: string;
    groupNo: number;
    peers: {
      user_id: string;
      full_name: string;
      archetype_id?: string;
      archetype_name?: string;
      assessed: boolean;
      compatScore?: number;
    }[];
  } | null>(null);
  
  // 💬 Chatbot state
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatPeer, setChatPeer] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<{ sender: 'coach' | 'user'; text: string; options?: { key: string; label: string }[] }[]>([]);
  const [chatStep, setChatStep] = useState(0);
  const [chatAnswers, setChatAnswers] = useState<Record<string, string>>({});
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<any>(null);

  // 🧘‍♀️ Satiya AI Wellbeing Coach state
  const [showSatiyaChat, setShowSatiyaChat] = useState(false);
  const [satiyaMessages, setSatiyaMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [satiyaInput, setSatiyaInput] = useState('');
  const [satiyaState, setSatiyaState] = useState<any>({
    isToxicMode: false,
    currentAqIndex: 0,
    aqAnswers: {}
  });
  const [satiyaOptions, setSatiyaOptions] = useState<string[]>([]);
  const [satiyaLoading, setSatiyaLoading] = useState(false);
  const [behavioralProfile, setBehavioralProfile] = useState<any>(null);

  const openSatiyaChat = async () => {
    setShowSatiyaChat(true);
    if (satiyaMessages.length === 0) {
      setSatiyaLoading(true);
      try {
        const res = await fetch('/api/satiya/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: id,
            message: 'สวัสดีค่ะ เริ่มต้นแนะนำตัววิเคราะห์สุขภาวะให้ฉันหน่อย',
            chatHistory: [],
            state: satiyaState
          })
        });
        const data = await res.json();
        if (data.ok) {
          setSatiyaMessages([
            { role: 'assistant', content: data.replyText }
          ]);
          setSatiyaState(data.state);
          setSatiyaOptions(data.options);
        }
      } catch (err) {
        console.error("Failed to load initial satiya greeting:", err);
      } finally {
        setSatiyaLoading(false);
      }
    }
  };

  const sendSatiyaMessage = async (msgText: string) => {
    if (!msgText.trim()) return;
    const newMessages = [...satiyaMessages, { role: 'user' as const, content: msgText }];
    setSatiyaMessages(newMessages);
    setSatiyaInput('');
    setSatiyaLoading(true);

    try {
      const res = await fetch('/api/satiya/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: id,
          message: msgText,
          chatHistory: newMessages,
          state: satiyaState
        })
      });
      const data = await res.json();
      if (data.ok) {
        setSatiyaMessages(prev => [...prev, { role: 'assistant', content: data.replyText }]);
        setSatiyaState(data.state);
        setSatiyaOptions(data.options);
      }
    } catch (err) {
      console.error("Failed to send Satiya message:", err);
    } finally {
      setSatiyaLoading(false);
    }
  };

  const closeSatiyaChat = async () => {
    setShowSatiyaChat(false);
    try {
      const { data: profile } = await supabase
        .from('satiya_behavioral_profiles')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (profile) {
        setBehavioralProfile(profile);
      }
    } catch (err) {
      console.error("Error refreshing behavioral profile on close:", err);
    }
  };

  useEffect(() => { trackPageView(`/result/${id}`); loadResult(); }, [id]);

  async function loadResult() {
    const { data } = await supabase.from('results').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(1).single();
    if (!data) { setLoading(false); return; }
    const { data: arch } = await supabase.from('archetypes').select('*').eq('id', data.archetype_id).single();
    const { data: user } = await supabase.from('users').select('*').eq('id', id).single();
    setResult({ ...data, arch: arch || null, user: user || null });
    setLoading(false);
    trackEvent('result_viewed', 'result', { archetype_id: data.archetype_id });

    try {
      const { data: profile } = await supabase
        .from('satiya_behavioral_profiles')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (profile) {
        setBehavioralProfile(profile);
      }
    } catch (err) {
      console.error("Error loading behavioral profile:", err);
    }

    if (!isShared) {
      loadSubgroupData(id);
    }
  }

  async function loadSubgroupData(userId: any) {
    try {
      // 1. Check if user is in an organization
      const { data: memberData } = await supabase
        .from('org_members')
        .select('org_id, role, organizations(name)')
        .eq('user_id', userId)
        .maybeSingle();

      if (!memberData) return;
      const orgName = (memberData.organizations as any)?.name || 'ไม่ระบุหน่วยงาน';
      const orgId = memberData.org_id;

      // 2. Fetch subgroup assignment for this user in this organization
      const { data: assignData } = await supabase
        .from('group_assignments')
        .select('session_id, group_number, group_sessions(session_name, org_id)')
        .eq('user_id', userId);

      if (!assignData || assignData.length === 0) {
        setSubgroupData({ orgName, sessionName: '', sessionId: '', groupNo: 0, peers: [] });
        return;
      }

      // We find the assignment under the same organization
      const userAssign = assignData.find(a => (a.group_sessions as any)?.org_id === orgId);
      if (!userAssign) {
        setSubgroupData({ orgName, sessionName: '', sessionId: '', groupNo: 0, peers: [] });
        return;
      }

      const sessionId = userAssign.session_id;
      const groupNo = userAssign.group_number;
      const sessionName = (userAssign.group_sessions as any)?.session_name || 'เวิร์กชอป';

      // 3. Find peers in the same session and group
      const { data: peerAssignments } = await supabase
        .from('group_assignments')
        .select(`
          user_id,
          users:user_id (
            full_name
          )
        `)
        .eq('session_id', sessionId)
        .eq('group_number', groupNo)
        .neq('user_id', userId);

      if (!peerAssignments || peerAssignments.length === 0) {
        setSubgroupData({ orgName, sessionName, sessionId, groupNo, peers: [] });
        return;
      }

      const peerIds = peerAssignments.map(p => p.user_id);

      // 4. Fetch actual test results for peers to get their archetype
      const { data: peerResults } = await supabase
        .from('results')
        .select('user_id, archetype_id, archetype_name_th')
        .in('user_id', peerIds)
        .order('created_at', { ascending: false });

      const latestResults: Record<string, any> = {};
      (peerResults || []).forEach(r => {
        if (!latestResults[r.user_id]) latestResults[r.user_id] = r;
      });

      // 5. Fetch existing peer feedback given by the current user in this session
      const { data: feedbacks } = await supabase
        .from('quick_assessments')
        .select('target_user_id, calc_compat, user_felt_compat')
        .eq('user_id', userId)
        .eq('session_id', sessionId);

      const feedbackMap: Record<string, any> = {};
      (feedbacks || []).forEach(f => {
        feedbackMap[f.target_user_id] = f;
      });

      // 6. Map everything together
      const peers = peerAssignments.map((p: any) => {
        const uId = p.user_id;
        const resultItem = latestResults[uId];
        const fb = feedbackMap[uId];

        return {
          user_id: uId,
          full_name: p.users?.full_name || 'ไม่ทราบชื่อ',
          archetype_id: resultItem?.archetype_id || '',
          archetype_name: resultItem?.archetype_name_th || 'ยังไม่ได้ทำแบบประเมิน',
          assessed: !!fb,
          compatScore: fb ? Math.round(fb.calc_compat * 100) : undefined
        };
      });

      setSubgroupData({ orgName, sessionName, sessionId, groupNo, peers });
    } catch (e) {
      console.error('Error loading subgroup data:', e);
    }
  }

  function startPeerFeedback(peer: any) {
    setChatPeer(peer);
    setChatStep(1);
    setChatAnswers({});
    setFeedbackSuccess(null);
    setChatMessages([
      {
        sender: 'coach',
        text: `สวัสดีครับ! ยินดีต้อนรับสู่ระบบประเมินปฏิสัมพันธ์กลุ่มย่อย (Conversational Peer Feedback) วันนี้ผมจะช่วยวัดความเข้ากันได้ระหว่างคุณและคุณ **${peer.full_name}** นะครับ`
      },
      {
        sender: 'coach',
        text: 'ขอถามสั้นๆ 3 ข้อเพื่อวิเคราะห์สไตล์ของเพื่อนร่วมทีมครับ\n\nข้อแรก (Comparative Judgement): **เมื่อเกิดปัญหาเร่งด่วนในกลุ่ม เพื่อนคนนี้มักจะตอบสนองอย่างไรครับ?**',
        options: [
          { key: 'A', label: '🔴 ลุยแก้ทันที (เพื่อแก้ปัญหาเร็วที่สุด)' },
          { key: 'B', label: '🟢 วิเคราะห์ก่อน (หาสาเหตุเงียบๆ คนเดียว)' },
          { key: 'C', label: '🔵 ถามความเห็นทีม (เรียกประชุมคุยระดมสมอง)' },
          { key: 'D', label: '🟡 รอดูสถานการณ์ (สังเกตการณ์ ไม่รีบตัดสินใจ)' }
        ]
      }
    ]);
    setShowChatModal(true);
  }

  async function handleChatOption(key: string, label: string) {
    const updatedMessages = [
      ...chatMessages,
      { sender: 'user' as const, text: label }
    ];
    
    const nextAnswers = { ...chatAnswers, [`q${chatStep}`]: key };
    setChatAnswers(nextAnswers);

    if (chatStep === 1) {
      setChatMessages([
        ...updatedMessages,
        {
          sender: 'coach',
          text: 'รับทราบครับ ข้อสอง (Descriptive Persona Matching): **บุคลิกและรูปแบบการทำงานกลุ่มของเขาเป็นแบบไหนครับ?**',
          options: [
            { key: 'A', label: '👤 ชอบลุยเดี่ยวเงียบๆ (ไม่เน้นประชุมยืดเยื้อ เน้นส่งงานตามเป้า)' },
            { key: 'B', label: '👥 ชอบระดมสมองเป็นทีม (ชอบประสานงาน ชวนคุย แลกเปลี่ยนความเห็น)' }
          ]
        }
      ]);
      setChatStep(2);
    } else if (chatStep === 2) {
      setChatMessages([
        ...updatedMessages,
        {
          sender: 'coach',
          text: 'เข้าใจเลยครับ และข้อสุดท้าย (Objective Checklist): **ในการตัดสินใจเรื่องงาน เขาใช้เกณฑ์อะไรเป็นหลักครับ?**',
          options: [
            { key: 'A', label: '📊 ข้อมูล ตรรกะ เหตุผล (เน้นความถูกต้อง ตัวเลข และความจริง)' },
            { key: 'B', label: '❤️ ความรู้สึกและบรรยากาศ (เน้นความสามัคคี จิตใจคน และบรรยากาศในทีม)' }
          ]
        }
      ]);
      setChatStep(3);
    } else if (chatStep === 3) {
      setSavingFeedback(true);
      try {
        const q1 = nextAnswers.q1;
        const q2 = nextAnswers.q2;
        const q3 = nextAnswers.q3;

        let estimatedQuad = 'Q4';
        if (q1 === 'A' || q1 === 'D') {
          estimatedQuad = 'Q4';
        } else if (q1 === 'B') {
          estimatedQuad = 'Q2';
        } else if (q1 === 'C') {
          estimatedQuad = 'Q3';
        }

        const eHigh = q2 === 'B';
        if (eHigh && estimatedQuad === 'Q4') estimatedQuad = 'Q3';
        if (eHigh && estimatedQuad === 'Q2') estimatedQuad = 'Q1';

        const tf = q3 === 'A' ? 'T' : 'F';
        const estimatedJung = tf + 'J';

        let peerActualArchId = chatPeer.archetype_id || undefined;
        
        const VIA_C: Record<string, number> = {
          'W-W':0.7,'W-C':0.7,'W-H':0.7,'W-J':0.6,'W-T':0.5,'W-Tr':0.8,
          'C-C':0.7,'C-H':0.6,'C-J':0.9,'C-T':0.5,'C-Tr':0.7,
          'H-H':0.9,'H-J':0.8,'H-T':0.7,'H-Tr':0.9,
          'J-J':0.6,'J-T':0.7,'J-Tr':0.6,'T-T':0.7,'T-Tr':0.8,'Tr-Tr':0.8,
        };
        const QD_C: Record<string, number> = {
          'Q1-Q1':0.6,'Q1-Q2':0.7,'Q1-Q3':0.7,'Q1-Q4':0.9,
          'Q2-Q2':0.5,'Q2-Q3':0.8,'Q2-Q4':0.6,
          'Q3-Q3':0.6,'Q3-Q4':0.7,'Q4-Q4':0.5,
        };
        const JG_C: Record<string, number> = {
          'TJ-TJ':0.6,'TJ-TP':0.8,'TJ-FJ':0.8,'TJ-FP':0.5,
          'TP-TP':0.6,'TP-FJ':0.6,'TP-FP':0.8,
          'FJ-FJ':0.6,'FJ-FP':0.8,'FP-FP':0.6,
        };

        const gc = (map: Record<string, number>, a: string, b: string): number => {
          return map[`${a}-${b}`] ?? map[`${b}-${a}`] ?? 0.5;
        };

        const userArchId = result.archetype_id;
        const userM = userArchId.match(/Y_(\w+)-(\w+)-(\w+)/);
        const userVia = userM?.[1] || 'W';
        const userQuad = userM?.[2] || 'Q4';
        const userJung = userM?.[3] || 'TJ';

        let targetVia = 'W';
        if (peerActualArchId) {
          const tm = peerActualArchId.match(/Y_(\w+)-/);
          if (tm) targetVia = tm[1];
        }

        const raw =
          gc(VIA_C, userVia, targetVia) * 0.40 +
          gc(QD_C, userQuad, estimatedQuad) * 0.25 +
          gc(JG_C, userJung, estimatedJung) * 0.15 +
          0.5 * 0.20;

        const stretched = ((raw - 0.35) / (0.85 - 0.35)) * 100;
        const calcCompat = Math.round(Math.max(15, Math.min(98, stretched)));

        setChatAnswers(prev => ({
          ...prev,
          estimatedQuad,
          estimatedJung,
          calcCompat: String(calcCompat)
        }));

        setChatMessages([
          ...updatedMessages,
          {
            sender: 'coach',
            text: `ขอบคุณมากครับ! ผลวิเคราะห์สไตล์ของเขาตามพฤติกรรมกลุ่มคือ **${
              estimatedQuad === 'Q1' ? 'กลุ่มนักสำรวจบุกเบิก (Q1)' :
              estimatedQuad === 'Q2' ? 'กลุ่มนักคิดนักกลยุทธ์ (Q2)' :
              estimatedQuad === 'Q3' ? 'กลุ่มผู้ประสานเชื่อมโยง (Q3)' : 'กลุ่มผู้สร้างสรรค์ (Q4)'
            } - ${estimatedJung}**`
          },
          {
            sender: 'coach',
            text: `ในฐานะที่คุณเป็น **${result.arch?.name_th || 'ผู้ทดสอบ'}** ความเข้ากันได้ทางทฤษฎีคือ **${calcCompat}%** ครับ!`
          },
          {
            sender: 'coach',
            text: `แล้วในความเป็นจริงล่ะครับ? **คุณพึงพอใจและรู้สึกเข้ากันได้กับเพื่อนคนนี้ในระดับใดครับ? (วัดจากระดับความพึงพอใจจริง)**`,
            options: [
              { key: '5', label: '⭐⭐⭐⭐⭐ ดีเยี่ยม (5/5)' },
              { key: '4', label: '⭐⭐⭐⭐ ดี (4/5)' },
              { key: '3', label: '⭐⭐⭐ ปานกลาง (3/5)' },
              { key: '2', label: '⭐⭐ น้อย (2/5)' },
              { key: '1', label: '⭐ น้อยที่สุด (1/5)' }
            ]
          }
        ]);
        setChatStep(4);
      } catch (err: any) {
        console.error(err);
        setChatMessages([
          ...updatedMessages,
          { sender: 'coach', text: 'เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้ง' }
        ]);
      } finally {
        setSavingFeedback(false);
      }
    } else if (chatStep === 4) {
      setSavingFeedback(true);
      try {
        const userFeltCompat = parseFloat(key);
        const calcCompatVal = parseFloat(chatAnswers.calcCompat) / 100;

        const { error: insErr } = await supabase
          .from('quick_assessments')
          .insert({
            user_id: id,
            target_user_id: chatPeer.user_id,
            session_id: subgroupData?.sessionId,
            q1_answer: chatAnswers.q1,
            q2_answer: chatAnswers.q2,
            q3_answer: chatAnswers.q3,
            estimated_quad: chatAnswers.estimatedQuad,
            estimated_jung: chatAnswers.estimatedJung,
            calc_compat: calcCompatVal,
            user_felt_compat: userFeltCompat
          });

        if (insErr) throw insErr;

        const compatScore = parseInt(chatAnswers.calcCompat);
        const level = compatScore >= 70 ? 'สูง' : compatScore >= 50 ? 'ปานกลาง' : 'ท้าทาย';
        
        const QUAD_GUIDE: Record<string, Record<string, string>> = {
          Q1: {
            Q1: 'คุณสองคนพลังงานสูงพอๆ กัน ต้องมีคนยอมเป็นผู้ฟังบ้าง ไม่งั้นทุกคนพูดพร้อมกัน',
            Q2: 'เขาต้องการเวลาคิดก่อนตอบ — รอ 24 ชั่วโมงหลังถามคำถามสำคัญ อย่าเร่ง',
            Q3: 'คู่ที่ลงตัวมาก คุณ inspire เขา connect คนรอบข้างให้คุณ',
            Q4: 'คู่ที่เสริมกันสูงที่สุด คุณสร้าง vision เขาทำให้มันเกิดขึ้นจริง',
          },
          Q2: {
            Q1: 'เขาต้องการ action เร็ว คุณต้องการ analysis — ตกลงกันว่ามี "เวลาคิด" กี่ชั่วโมงก่อน decide',
            Q2: 'ระวัง Analysis Paralysis สองคน ต้องมี deadline ที่ชัดเจน',
            Q3: 'เขาช่วยให้คุณออกมาจากโลกความคิด คุณช่วยให้เขามีทิศทาง',
            Q4: 'ทั้งคู่ชอบทำคนเดียว ต้องนัด sync meeting เป็นประจำ ไม่งั้น drift ห่างกัน',
          },
          Q3: {
            Q1: 'คุณช่วย manage ความสัมพันธ์ให้เขา เขา push คุณออกจาก comfort zone',
            Q2: 'เขาต้องการ space คุณต้องการ connection — ตกลงว่าจะคุยกันกี่ครั้งต่อสัปดาห์',
            Q3: 'เข้ากันดีด้านความสัมพันธ์ แต่อาจขาด direction ต้องมีคนเป็น "ผู้นำทิศทาง"',
            Q4: 'คุณ social เขา systematic คุณ connect เขา execute ผลดี',
          },
          Q4: {
            Q1: 'เขา disrupt คุณ build ให้เขา "เสี่ยง" ในกรอบที่คุณวางไว้ แทนที่จะห้ามเลย',
            Q2: 'ทั้งคู่ชอบทำงานคนเดียว ต้องนัดเช็กอินสม่ำเสมอและมี shared goal ที่ชัด',
            Q3: 'เขาดูแลความสัมพันธ์ คุณดูแลคุณภาพงาน แบ่งงานตามจุดแข็งได้เลย',
            Q4: 'ทำงานด้วยกันได้ดี แต่ต้องระวังไม่มีใครยืดหยุ่นเมื่อแผนพัง',
          },
        };
        const JUNG_GUIDE: Record<string, Record<string, string>> = {
          TJ: {
            TJ: 'คุณสองคนตรงไปตรงมาเหมือนกัน — ระวัง "ชนกัน" เรื่องวิธีทำงาน ให้ต่างคนมีพื้นที่',
            TP: 'คุณวางแผน เขา flexible — กำหนดว่าใครตัดสินใจเรื่องอะไร',
            FJ: 'คุณเน้นเหตุผล เขาเน้นความสัมพันธ์ — ฟังความรู้สึกเขาก่อน แล้วค่อย logic',
            FP: 'สไตล์ต่างกันมาก คุณต้องการโครงสร้าง เขาต้องการอิสระ — แบ่งส่วนที่ตกลงร่วมและส่วนที่ต่างคนทำ',
          },
          FJ: {
            TJ: 'เขาอาจดูเย็นชา คุณอาจดู sensitive เกิน — จริงๆ ทั้งคู่ใส่ใจ แค่แสดงออกต่างกัน',
            TP: 'คุณชอบ closure เขาชอบ options เปิด — ตกลงว่า deadline ต้องชัดแค่ไหน',
            FJ: 'เข้าใจกันง่ายมาก แต่ระวัง echo chamber — ต้องการคนที่คิดต่างมา challenge',
            FP: 'ทั้งคู่เน้นคน คุณช่วยให้มีโครงสร้าง เขาช่วยให้ยืดหยุ่น',
          },
          TP: {
            TJ: 'เขาต้องการ plan ชัด คุณชอบ improvise — มี "core plan" ที่เปลี่ยนไม่ได้ และส่วน flexible',
            TP: 'สนุก creative ด้วยกัน แต่ไม่มีใคร follow through — ต้องมีคนรับผิดชอบ execution',
            FJ: 'คุณ logic เขา feeling — ฟังดูต่างกัน แต่เสริมกันดีถ้า trust กัน',
            FP: 'ทั้งคู่ชอบอิสระ ระวังขาดความรับผิดชอบร่วมกัน',
          },
          FP: {
            TJ: 'สไตล์ต่างกันสุด แต่เสริมกันได้ดีมากถ้า respect กัน คุณ inspire เขา execute',
            TP: 'ทั้งคู่ flexible creative — ต้องมีคน anchor ที่เป็น responsible party',
            FJ: 'ทั้งคู่ใส่ใจคน คุณ creative เขา organised ทำงานด้วยกันได้ดี',
            FP: 'เข้าใจกันดีมาก แต่ต้องมี structure จากภายนอก',
          },
        };

        const userM = result.archetype_id.match(/Y_(\w+)-(\w+)-(\w+)/);
        const userQuad = userM?.[2] || 'Q4';
        const userJung = userM?.[3] || 'TJ';

        const quadTip = QUAD_GUIDE[userQuad]?.[chatAnswers.estimatedQuad] || '';
        const jungTip = JUNG_GUIDE[userJung]?.[chatAnswers.estimatedJung] || '';

        setFeedbackSuccess({
          calcCompat: compatScore,
          feltCompat: userFeltCompat,
          estimatedStyle: `${chatAnswers.estimatedQuad} - ${chatAnswers.estimatedJung}`,
          level,
          tips: [quadTip, jungTip].filter(Boolean)
        });

        setChatMessages([
          ...updatedMessages,
          {
            sender: 'coach',
            text: `บันทึกข้อมูลเรียบร้อยแล้วครับ! ค่าความคลาดเคลื่อนสะสม (Delta) คือ **${(userFeltCompat - (compatScore/100)).toFixed(2)}** ระบบได้รับฟีดแบ็กเพื่อเรียนรู้ปฏิสัมพันธ์ของคุณแล้วครับ 💙`
          }
        ]);
        setChatStep(5);
        loadSubgroupData(id);
      } catch (err: any) {
        console.error(err);
        setChatMessages([
          ...updatedMessages,
          { sender: 'coach', text: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง: ' + err.message }
        ]);
      } finally {
        setSavingFeedback(false);
      }
    }
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

      {/* ═══ SATIYA AI MINI-INSIGHT CARD (GLASSMORPHISM) ═══ */}
      {behavioralProfile?.delta_report?.ui_reflection_text && (
        <div className="relative overflow-hidden rounded-2xl p-5 border border-white/40 shadow-xl bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-[#1A3A5C]/10 backdrop-blur-md mt-3 animate-fade-in">
          {/* Decorative gradients */}
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-400/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 flex items-start gap-3.5">
            <span className="text-3xl flex-shrink-0 mt-0.5 animate-pulse">🧘‍♀️</span>
            <div className="space-y-1.5 text-left">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-[#1A3A5C] text-sm tracking-wide">Satiya AI Insight</h4>
                {behavioralProfile.full_personality_score && (
                  <span className="bg-teal-500/10 text-teal-800 text-[0.65rem] px-2 py-0.5 rounded-full font-bold border border-teal-200/30">
                    ดัชนีพฤติกรรม: {behavioralProfile.full_personality_score}
                  </span>
                )}
              </div>
              <p className="text-xs md:text-sm text-gray-700 leading-relaxed font-medium">
                &quot;{behavioralProfile.delta_report.ui_reflection_text}&quot;
              </p>
              {behavioralProfile.delta_report.primary_divergence && (
                <div className="text-[0.7rem] text-[#1A3A5C]/80 bg-[#1A3A5C]/5 border border-[#1A3A5C]/10 rounded-lg p-2 mt-2">
                  <strong>ความสอดคล้องเชิงลึก:</strong> {behavioralProfile.delta_report.primary_divergence}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* ═══ SUBGROUP WIDGET ═══ */}
      {!isShared && subgroupData && (
        <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 space-y-4 text-left">
          <div className="flex justify-between items-center border-b pb-3">
            <div>
              <h3 className="font-bold text-[#1A3A5C] text-sm flex items-center gap-1.5">
                <span>👥</span> กลุ่มย่อยของคุณ
              </h3>
              <p className="text-[0.65rem] text-gray-400">หน่วยงาน: {subgroupData.orgName}</p>
            </div>
            {subgroupData.groupNo > 0 ? (
              <span className="bg-[#1A3A5C] text-white text-xs font-bold px-2.5 py-1 rounded-full">
                กลุ่มที่ {subgroupData.groupNo}
              </span>
            ) : (
              <span className="bg-gray-100 text-gray-500 text-xs font-bold px-2.5 py-1 rounded-full">
                รอจัดกลุ่ม
              </span>
            )}
          </div>

          {subgroupData.groupNo > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                รอบกิจกรรม: <strong>{subgroupData.sessionName}</strong>
              </p>
              <div className="space-y-2">
                {subgroupData.peers.map(p => (
                  <div key={p.user_id} className="flex items-center justify-between bg-gray-50/70 p-3 rounded-xl border border-gray-105">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-800 truncate">{p.full_name}</p>
                      <p className="text-[0.65rem] text-gray-400 truncate">
                        บุคลิกภาพ: {p.archetype_name}
                      </p>
                    </div>
                    {p.assessed ? (
                      <div className="text-right">
                        <span className="inline-block bg-green-50 text-green-700 text-[0.65rem] font-bold px-2 py-0.5 rounded-full border border-green-200">
                          ประเมินแล้ว
                        </span>
                        {p.compatScore !== undefined && (
                          <p className="text-[0.68rem] text-green-600 font-bold mt-0.5">
                            ความเข้ากัน: {p.compatScore}%
                          </p>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => startPeerFeedback(p)}
                        className="bg-blue-50 text-[#1A3A5C] hover:bg-[#1A3A5C] hover:text-white transition-colors border border-blue-200 text-[0.68rem] font-bold px-3 py-1.5 rounded-lg"
                      >
                        💬 ประเมินเพื่อน
                      </button>
                    )}
                  </div>
                ))}
                
                {subgroupData.peers.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">ไม่พบเพื่อนร่วมกลุ่มคนอื่นในขณะนี้</p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-blue-50/50 p-4 rounded-xl border border-dashed border-blue-200 text-center space-y-1">
              <p className="text-xs font-bold text-[#1A3A5C]">รอผู้ควบคุมมอบหมายกลุ่มย่อย</p>
              <p className="text-[0.65rem] text-gray-400">เมื่อผู้ดูแลระบบสุ่มจัดกลุ่มเสร็จสิ้น รายชื่อเพื่อนร่วมกลุ่มจะปรากฏตรงนี้ครับ</p>
            </div>
          )}
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

      {/* ═══ CHATBOT PEER FEEDBACK MODAL ═══ */}
      {showChatModal && chatPeer && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm" onClick={() => setShowChatModal(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div className="bg-[#1A3A5C] text-white p-4 flex justify-between items-center text-left">
              <div className="flex items-center gap-2">
                <span className="text-xl">🦅</span>
                <div>
                  <h3 className="font-bold text-sm">KRUTH MIND Coach</h3>
                  <p className="text-[0.65rem] text-blue-200">ประเมินความเข้ากันได้กับ คุณ{chatPeer.full_name}</p>
                </div>
              </div>
              <button onClick={() => setShowChatModal(false)} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 space-y-4 max-h-[45vh] min-h-[300px]">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                  <div className={`max-w-[85%] rounded-2xl p-3.5 text-xs md:text-sm leading-relaxed text-left ${
                    msg.sender === 'user'
                      ? 'bg-[#1A3A5C] text-white rounded-tr-none'
                      : 'bg-white text-gray-700 shadow-sm border border-gray-100 rounded-tl-none'
                  }`}>
                    {msg.sender !== 'user' && (
                      <span className="font-bold text-[0.65rem] text-blue-500 block mb-1">KRUTH Coach</span>
                    )}
                    {msg.text.split('\n').map((line, idx) => (
                      <span key={idx} className="block mt-0.5">{line}</span>
                    ))}
                  </div>
                </div>
              ))}
              
              {savingFeedback && (
                <div className="flex justify-start">
                  <div className="bg-white text-gray-400 shadow-sm border rounded-2xl p-3 text-xs flex items-center gap-2">
                    <span className="animate-pulse">● ● ●</span> กำลังคำนวณ...
                  </div>
                </div>
              )}
            </div>

            {/* Interactive Options / Buttons */}
            <div className="p-4 bg-white border-t space-y-2">
              {chatStep < 5 && chatMessages[chatMessages.length - 1]?.options ? (
                <div className="grid grid-cols-1 gap-2">
                  {chatMessages[chatMessages.length - 1].options?.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => handleChatOption(opt.key, opt.label)}
                      className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-[#1A3A5C] hover:bg-blue-50/30 text-xs md:text-sm transition-all font-medium text-gray-700"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {chatStep === 5 && feedbackSuccess && (
                <div className="bg-green-50 border border-green-100 rounded-xl p-4 space-y-3 text-left animate-fade-in">
                  <div className="flex items-center gap-2 text-green-800 font-bold text-sm">
                    <span>🌟</span> ประเมินปฏิสัมพันธ์สำเร็จ!
                  </div>
                  <div className="text-xs text-green-700 space-y-1">
                    <p>สไตล์พฤติกรรมกลุ่มของเพื่อน: <strong>{feedbackSuccess.estimatedStyle}</strong></p>
                    <p>ความเข้ากันได้ทางทฤษฎี: <strong>{feedbackSuccess.calcCompat}% ({feedbackSuccess.level})</strong></p>
                    <p>ความพึงพอใจจริงของคุณ: <strong>{feedbackSuccess.feltCompat} / 5 ดาว</strong></p>
                  </div>
                  {feedbackSuccess.tips.length > 0 && (
                    <div className="border-t border-green-200 pt-2.5 text-left">
                      <p className="font-bold text-xs text-green-800 mb-1">💡 คำแนะนำการปรับตัว:</p>
                      <ul className="list-disc pl-4 text-[0.7rem] text-green-700 space-y-1 leading-relaxed">
                        {feedbackSuccess.tips.map((t: string, idx: number) => (
                          <li key={idx}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button
                    onClick={() => setShowChatModal(false)}
                    className="w-full mt-2 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-colors"
                  >
                    ปิดหน้าต่างแชต
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* 🧘‍♀️ SATIYA AI WELLBEING COACH FLOATING WIDGET */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {/* Chat window panel */}
        {showSatiyaChat && (
          <div className="bg-white/95 border border-gray-100 shadow-2xl rounded-2xl w-[90vw] max-w-md h-[500px] flex flex-col mb-4 overflow-hidden animate-fade-in text-left">
            {/* Header with gradient theme */}
            <div className="bg-gradient-to-r from-[#1D8B75] to-[#1A3A5C] text-white p-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xl">🧘‍♀️</span>
                <div>
                  <h3 className="font-bold text-sm">Satiya AI Coach</h3>
                  <p className="text-[0.65rem] text-teal-100">ผู้แนะนำและดูแลสุขภาวะส่วนตัวของคุณ</p>
                </div>
              </div>
              <button onClick={closeSatiyaChat} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
              {satiyaMessages.map((msg, index) => (
                <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                  <div className={`max-w-[85%] rounded-2xl p-3.5 text-xs md:text-sm leading-relaxed text-left ${
                    msg.role === 'user'
                      ? 'bg-[#1A3A5C] text-white rounded-tr-none'
                      : 'bg-white text-gray-700 shadow-sm border border-gray-100 rounded-tl-none'
                  }`}>
                    {msg.role !== 'user' && (
                      <span className="font-bold text-[0.65rem] text-[#1D8B75] block mb-1">Satiya AI Coach</span>
                    )}
                    {msg.content.split('\n').map((line, idx) => (
                      <span key={idx} className="block mt-0.5">{line}</span>
                    ))}
                  </div>
                </div>
              ))}

              {satiyaLoading && (
                <div className="flex justify-start">
                  <div className="bg-white text-gray-400 shadow-sm border rounded-2xl p-3 text-xs flex items-center gap-2">
                    <span className="animate-pulse">● ● ●</span> Satiya กำลังพิมพ์...
                  </div>
                </div>
              )}
            </div>

            {/* Quick Reply Option Suggestions */}
            {satiyaOptions.length > 0 && !satiyaLoading && (
              <div className="px-4 py-2 bg-white border-t flex flex-wrap gap-2 overflow-x-auto">
                {satiyaOptions.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => sendSatiyaMessage(opt)}
                    className="text-xs bg-teal-50 hover:bg-teal-100 border border-teal-100 text-teal-800 px-3 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* Message Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendSatiyaMessage(satiyaInput);
              }}
              className="p-3 bg-white border-t flex gap-2"
            >
              <input
                type="text"
                value={satiyaInput}
                onChange={(e) => setSatiyaInput(e.target.value)}
                disabled={satiyaLoading}
                placeholder={satiyaState.isToxicMode ? "พิมพ์ระบุคำตอบของคุณ..." : "พิมพ์ปรึกษาสุขภาพใจ..."}
                className="flex-1 px-3.5 py-2 border border-gray-200 rounded-xl text-xs md:text-sm focus:outline-none focus:border-[#1D8B75] disabled:bg-gray-50"
              />
              <button
                type="submit"
                disabled={satiyaLoading || !satiyaInput.trim()}
                className="px-4 py-2 bg-[#1A3A5C] hover:bg-[#2E75B6] disabled:bg-gray-200 text-white rounded-xl text-xs font-bold transition-colors"
              >
                ส่ง
              </button>
            </form>
          </div>
        )}

        {/* Floating Bubble Button */}
        <button
          onClick={openSatiyaChat}
          className="flex items-center gap-2 px-5 py-3 rounded-full bg-gradient-to-r from-[#1D8B75] to-[#1A3A5C] text-white shadow-xl hover:scale-105 transition-transform font-bold text-xs md:text-sm"
        >
          <span className="text-base">🧘‍♀️</span> คุยกับ AI Wellbeing Coach
        </button>
      </div>
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