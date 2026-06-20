'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { SimProfile, RoVHero, calcTeamSynergy, calcRoVMatchCapability, calcPredictedResourceGreed, calcPredictedResourceSharing } from '@/lib/scoring';
import { usePrivacyTimeout } from '@/hooks/usePrivacyTimeout';

export default function EsportsLiveWarRoom() {
  // --- States ---
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [groupNumbers, setGroupNumbers] = useState<number[]>([]);
  const [selectedGroupNumber, setSelectedGroupNumber] = useState<number | ''>('');
  
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [rovHeroes, setRovHeroes] = useState<RoVHero[]>([]);
  
  // Team Draft
  const [teamHeroIds, setTeamHeroIds] = useState<Record<string, string>>({}); // user_id -> hero_id
  
  // Opponent Draft
  const [oppHeroIds, setOppHeroIds] = useState<string[]>(['', '', '', '', '']); // 5 slots
  
  // Live Telemetry
  const [gameMinute, setGameMinute] = useState<number>(5);
  const [goldDiff, setGoldDiff] = useState<number>(0);
  
  // Chatbot
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // 🔒 Security & Privacy States
  const [role, setRole] = useState<string>('org_admin');
  const [isLocked, setIsLocked] = useState(false);
  const [swappedMembers, setSwappedMembers] = useState<any[]>([]);
  const [allOrgMembers, setAllOrgMembers] = useState<any[]>([]);
  const [macroVulnerability, setMacroVulnerability] = useState<number | null>(null);
  const [teamFocusStability, setTeamFocusStability] = useState<number | null>(null);

  // Real-time Audio Simulation States
  const [activeVoiceMemberId, setActiveVoiceMemberId] = useState<string | null>(null);
  const [memberVoiceStates, setMemberVoiceStates] = useState<Record<string, {
    vvi: number;
    state: string;
    macroLabel?: string;
    macroAdvice?: string;
    pitch: number;
    rate: number;
    negativeDensity: number;
  }>>({});
  
  // Feedback messages
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' | '' }>({ text: '', type: '' });
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 🔒 Zero-Trust Inactivity & Tab-Switching Lock hook
  usePrivacyTimeout({
    isActive: !isLocked,
    onTimeout: () => {
      setIsLocked(true);
      showMsg('🔒 ระบบล็อกหน้าจอความปลอดภัยอัตโนมัติเนื่องจากไม่มีการเคลื่อนไหวหรือมีการสลับหน้าต่างทำงาน', 'error');
    }
  });

  // --- Initial Load ---
  useEffect(() => {
    loadOrganizations();
    loadHeroes();
    checkAdminRole();
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  // Load sessions when organization changes
  useEffect(() => {
    if (selectedOrgId) {
      loadSessions(selectedOrgId);
      setSelectedSessionId('');
      setGroupNumbers([]);
      setSelectedGroupNumber('');
      setMembers([]);
      setSwappedMembers([]);
      loadAllOrgMembers(selectedOrgId);
      loadMacroMetrics(selectedOrgId);
    }
  }, [selectedOrgId]);

  // Load group numbers when session changes
  useEffect(() => {
    if (selectedSessionId) {
      loadGroupNumbers(selectedSessionId);
      setSelectedGroupNumber('');
      setMembers([]);
      setSwappedMembers([]);
    }
  }, [selectedSessionId]);

  // Load members and telemetry when group is selected
  useEffect(() => {
    if (selectedSessionId && selectedGroupNumber !== '') {
      loadGroupData();
    }
  }, [selectedSessionId, selectedGroupNumber]);

  // Real-time Voice Volatility Index (VVI) simulation loop
  useEffect(() => {
    if (!activeVoiceMemberId || !selectedSessionId) return;

    const interval = setInterval(async () => {
      const target = swappedMembers.find(m => m.user_id === activeVoiceMemberId);
      if (!target) return;

      const baseN = target.score_n ?? 3.0;
      const rand = Math.random();
      let pitch_ratio = 1.0 + (rand * 0.4);
      let speech_rate = 1.0 + (rand * 0.3);
      let negative_keyword_density = 0.0;

      // Simulate tilt for high-neuroticism players under pressure or randomly
      if (baseN > 3.5 && rand > 0.4) {
        pitch_ratio = 1.5 + (Math.random() * 0.5);
        speech_rate = 1.4 + (Math.random() * 0.4);
        negative_keyword_density = 0.3 + (Math.random() * 0.4);
      } else if (rand > 0.75) {
        // Hype State
        pitch_ratio = 1.3 + (Math.random() * 0.3);
        speech_rate = 1.3 + (Math.random() * 0.3);
        negative_keyword_density = 0.0;
      } else if (rand < 0.15) {
        // Dejected State
        pitch_ratio = 0.8 + (Math.random() * 0.2);
        speech_rate = 0.7 + (Math.random() * 0.2);
        negative_keyword_density = 0.1 + (Math.random() * 0.2);
      }

      try {
        const res = await fetch('/api/audio/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: selectedSessionId,
            group_number: selectedGroupNumber ? Number(selectedGroupNumber) : 1,
            user_id: activeVoiceMemberId,
            game_time_seconds: gameMinute * 60 + Math.floor(Math.random() * 60),
            pitch_ratio,
            speech_rate,
            negative_keyword_density,
            last_game_event: 'FIGHTING'
          })
        });

        if (res.ok) {
          const resData = await res.json();
          if (resData.success) {
            setMemberVoiceStates(prev => ({
              ...prev,
              [activeVoiceMemberId]: {
                vvi: resData.data.vvi,
                state: resData.data.predictedState,
                macroLabel: resData.data.macroLabel,
                macroAdvice: resData.data.macroAdvice,
                pitch: Number(pitch_ratio.toFixed(2)),
                rate: Number(speech_rate.toFixed(2)),
                negativeDensity: Number(negative_keyword_density.toFixed(2))
              }
            }));
          }
        }
      } catch (err) {
        console.error("Audio processing simulation error:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeVoiceMemberId, selectedSessionId, selectedGroupNumber, gameMinute, swappedMembers]);

  // --- Functions ---
  async function checkAdminRole() {
    const kruthRole = localStorage.getItem('kruth_admin_role') || 'org_admin';
    setRole(kruthRole);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('is_super_admin')
        .eq('id', user.id)
        .single();
      
      if (userData?.is_super_admin) {
        setIsSuperAdmin(true);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadOrganizations() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('name');
      if (error) throw error;
      setOrganizations(data || []);
      if (data && data.length > 0) {
        setSelectedOrgId(data[0].id);
      }
    } catch (e: any) {
      showMsg('เกิดข้อผิดพลาดในการโหลดองค์กร: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadHeroes() {
    try {
      const { data, error } = await supabase
        .from('rov_knowledge_heroes')
        .select('*')
        .order('hero_name_en');
      if (error) throw error;
      setRovHeroes(data || []);
    } catch (e: any) {
      console.error('Error loading heroes:', e.message);
    }
  }

  async function loadSessions(orgId: string) {
    try {
      const { data, error } = await supabase
        .from('group_sessions')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSessions(data || []);
      if (data && data.length > 0) {
        setSelectedSessionId(data[0].id);
      }
    } catch (e: any) {
      showMsg('เกิดข้อผิดพลาดในการโหลดเซสชัน: ' + e.message, 'error');
    }
  }

  async function loadGroupNumbers(sessionId: string) {
    try {
      const { data, error } = await supabase
        .from('group_assignments')
        .select('group_number')
        .eq('session_id', sessionId);
      if (error) throw error;
      
      const nums = Array.from(new Set((data || []).map(a => a.group_number))).sort((a, b) => a - b);
      setGroupNumbers(nums);
      if (nums.length > 0) {
        setSelectedGroupNumber(nums[0]);
      }
    } catch (e: any) {
      showMsg('เกิดข้อผิดพลาดในการโหลดกลุ่ม: ' + e.message, 'error');
    }
  }

  async function loadGroupData() {
    try {
      setLoading(true);
      // 1. Fetch group members assigned to the session & group number
      const { data: assignments, error: assignErr } = await supabase
        .from('group_assignments')
        .select('user_id')
        .eq('session_id', selectedSessionId)
        .eq('group_number', selectedGroupNumber);

      if (assignErr) throw assignErr;
      if (!assignments || assignments.length === 0) {
        setMembers([]);
        setLoading(false);
        return;
      }

      const userIds = assignments.map(a => a.user_id);

      // 2. Fetch KWI responses for these users
      const { data: kwiData } = await supabase
        .from('kwi_responses')
        .select('*')
        .in('user_id', userIds);

      // 3. Fetch results for Jungian & Quadrant
      const { data: resultsData } = await supabase
        .from('results')
        .select('*, archetypes(name_th)')
        .in('user_id', userIds);

      // 4. Fetch users details
      const { data: usersData } = await supabase
        .from('users')
        .select('id, full_name, gender, thai_element, chinese_element')
        .in('id', userIds);

      const parsedMembers = userIds.map(uid => {
        const u = (usersData || []).find(x => x.id === uid);
        const r = (resultsData || []).find(x => x.user_id === uid);
        const k = (kwiData || []).find(x => x.user_id === uid);

        return {
          user_id: uid,
          full_name: u?.full_name || 'ไม่พบชื่อ',
          gender: u?.gender,
          thai_element: u?.thai_element,
          chinese_element: u?.chinese_element,
          score_o: r?.score_o,
          score_c: r?.score_c,
          score_e: r?.score_e,
          score_a: r?.score_a,
          score_n: r?.score_n,
          quadrant_primary: r?.quadrant_primary,
          jungian_type: r?.jungian_type,
          archetype: Array.isArray(r?.archetypes) ? r?.archetypes[0]?.name_th : r?.archetypes?.name_th,
          kwi: k ? {
            vitality: k.vitality,
            meaning: k.meaning,
            connection: k.connection,
            mastery: k.mastery,
            resilience: k.resilience
          } : undefined
        };
      });

      setMembers(parsedMembers);
      setSwappedMembers(parsedMembers);

      // 5. Fetch telemetry session from db if exists
      const { data: telemetry, error: telErr } = await supabase
        .from('live_match_telemetry')
        .select('*')
        .eq('session_id', selectedSessionId)
        .eq('group_number', selectedGroupNumber)
        .maybeSingle();

      if (telemetry) {
        setGameMinute(telemetry.current_minute || 5);
        setGoldDiff(telemetry.gold_difference || 0);
        setTeamHeroIds(telemetry.team_hero_ids || {});
        setOppHeroIds(telemetry.opponent_hero_ids || ['', '', '', '', '']);
        setChatHistory(telemetry.chat_logs || []);
      } else {
        setGameMinute(5);
        setGoldDiff(0);
        setTeamHeroIds({});
        setOppHeroIds(['', '', '', '', '']);
        setChatHistory([]);
      }

    } catch (e: any) {
      showMsg('เกิดข้อผิดพลาดในการโหลดรายละเอียดกลุ่มย่อย: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadAllOrgMembers(orgId: string) {
    try {
      const { data: mData, error: mErr } = await supabase
        .from('org_members')
        .select(`
          user_id,
          role,
          users:user_id (
            id,
            full_name,
            gender,
            thai_element,
            chinese_element
          )
        `)
        .eq('org_id', orgId);

      if (mErr) throw mErr;
      if (!mData) return;

      const parsed: any[] = mData.map((m: any) => ({
        user_id: m.user_id,
        role: m.role || 'member',
        full_name: m.users?.full_name || 'ไม่ทราบชื่อ',
        gender: m.users?.gender || 'O',
        thai_element: m.users?.thai_element || '',
        chinese_element: m.users?.chinese_element || '',
        archetype: '',
        quadrant_primary: '',
        jungian_type: '',
        score_o: 3.0,
        score_c: 3.0,
        score_e: 3.0,
        score_a: 3.0,
        score_n: 3.0,
      }));

      if (parsed.length > 0) {
        const uids = parsed.map(m => m.user_id);
        const { data: rData } = await supabase
          .from('results')
          .select('user_id, archetype_name_th, quadrant_primary, jungian_type, score_o, score_c, score_e, score_a, score_n')
          .in('user_id', uids);

        if (rData) {
          parsed.forEach(m => {
            const r = rData.find(x => x.user_id === m.user_id);
            if (r) {
              m.archetype = r.archetype_name_th;
              m.quadrant_primary = r.quadrant_primary;
              m.jungian_type = r.jungian_type;
              m.score_o = r.score_o;
              m.score_c = r.score_c;
              m.score_e = r.score_e;
              m.score_a = r.score_a;
              m.score_n = r.score_n;
            }
          });
        }

        // 2d. Fetch member_activity_evaluations
        try {
          const { data: actData, error: actErr } = await supabase
            .from('member_activity_evaluations')
            .select('user_id, performance_rating, activity_name, qualitative_notes')
            .in('user_id', uids);

          if (!actErr && actData) {
            const userEvals: Record<string, any[]> = {};
            actData.forEach(act => {
              if (!userEvals[act.user_id]) userEvals[act.user_id] = [];
              userEvals[act.user_id].push({
                performance_rating: Number(act.performance_rating),
                activity_name: act.activity_name,
                qualitative_notes: act.qualitative_notes
              });
            });

            parsed.forEach(m => {
              m.activity_evaluations = userEvals[m.user_id] || [];
            });
          }
        } catch (actErr) {
          console.error("Error loading activity evaluations in war-room:", actErr);
        }

        // 2e. Fetch executive_chat_insights
        try {
          const { data: insightData, error: insightErr } = await supabase
            .from('executive_chat_insights')
            .select('target_user_id, insight_tag, confidence_score, context_excerpt')
            .eq('org_id', orgId);

          if (!insightErr && insightData) {
            const userGeneralConflict: Record<string, boolean> = {};
            insightData.forEach(ins => {
              if (ins.insight_tag === 'conflict_risk') {
                userGeneralConflict[ins.target_user_id] = true;
              }
            });

            parsed.forEach(m => {
              m.has_conflict_risk = !!userGeneralConflict[m.user_id];
              m.conflict_risk_users = [];
            });
          }
        } catch (insightErr) {
          console.error("Error loading executive chat insights in war-room:", insightErr);
        }
      }
      setAllOrgMembers(parsed);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadMacroMetrics(orgId: string) {
    try {
      const { data, error } = await supabase
        .from('coach_team_vulnerability_snapshot')
        .select('macro_team_vulnerability_index, team_global_focus_stability_percentage')
        .eq('org_id', orgId)
        .maybeSingle();

      if (!error && data) {
        setMacroVulnerability(data.macro_team_vulnerability_index);
        setTeamFocusStability(data.team_global_focus_stability_percentage);
      } else {
        setMacroVulnerability(null);
        setTeamFocusStability(null);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSaveTelemetry() {
    if (!selectedSessionId || selectedGroupNumber === '') return;
    try {
      const { error } = await supabase
        .from('live_match_telemetry')
        .upsert({
          session_id: selectedSessionId,
          group_number: Number(selectedGroupNumber),
          current_minute: gameMinute,
          gold_difference: goldDiff,
          team_hero_ids: teamHeroIds,
          opponent_hero_ids: oppHeroIds,
          chat_logs: chatHistory
        }, { onConflict: 'session_id,group_number' });

      if (error) throw error;
      showMsg('บันทึกสถานะเรียลไทม์สำเร็จ', 'success');
    } catch (e: any) {
      showMsg('เกิดข้อผิดพลาดในการบันทึก: ' + e.message, 'error');
    }
  }

  async function handleSendChatMessage() {
    if (!chatInput.trim() || chatLoading || !selectedSessionId || selectedGroupNumber === '') return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setChatLoading(true);

    const updatedHistory = [...chatHistory, { role: 'user' as const, content: userMsg }];
    setChatHistory(updatedHistory);

    try {
      const res = await fetch('/api/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: selectedSessionId,
          groupNumber: Number(selectedGroupNumber),
          message: userMsg,
          chatHistory: updatedHistory.slice(0, -1), // Send history up to the previous message
          goldDiff,
          gameMinute,
          teamHeroIds,
          opponentHeroIds: oppHeroIds.filter(id => !!id)
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to request coach chatbot');

      const botReply = data.replyText;
      const finalHistory = [...updatedHistory, { role: 'assistant' as const, content: botReply }];
      setChatHistory(finalHistory);

      // Auto upsert state to db with updated logs
      await supabase
        .from('live_match_telemetry')
        .upsert({
          session_id: selectedSessionId,
          group_number: Number(selectedGroupNumber),
          current_minute: gameMinute,
          gold_difference: goldDiff,
          team_hero_ids: teamHeroIds,
          opponent_hero_ids: oppHeroIds,
          chat_logs: finalHistory
        }, { onConflict: 'session_id,group_number' });

    } catch (e: any) {
      showMsg('เกิดข้อผิดพลาดของระบบบอทคำนวณ: ' + e.message, 'error');
    } finally {
      setChatLoading(false);
    }
  }

  function handleResetChat() {
    setChatHistory([]);
    showMsg('รีเซ็ตบทสนทนาเรียบร้อยแล้ว', 'success');
  }

  function showMsg(text: string, type: 'success' | 'error') {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  }

  // --- Dynamic Rules Helper ---
  // Recommends hero classes based on player's Jungian/Archetype
  function getHeroFitSuggestion(profile: any) {
    const isAggressive = profile.quadrant_primary === 'Q1' || profile.quadrant_primary === 'Q4' || profile.jungian_type?.includes('TP');
    const isTactical = profile.jungian_type?.includes('TJ') || profile.quadrant_primary === 'Q2';
    const isCooperative = profile.quadrant_primary === 'Q3' || profile.jungian_type?.includes('FJ');

    if (isAggressive) {
      return {
        role: 'Assassin / Marksman (ดาเมจสูง/บุกทะลวง)',
        heroes: ['Nakroth', 'Kriknak', 'Capheny', 'Airi', 'Yue'],
        colorClass: 'text-rose-400 bg-rose-500/10 border-rose-500/20'
      };
    } else if (isTactical) {
      return {
        role: 'Fighter / Mage (วางแผน/คุมทีมไฟต์)',
        heroes: ['Omen', 'Maloch', 'Yue', 'Liliana', 'Kriknak'],
        colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      };
    } else if (isCooperative) {
      return {
        role: 'Tank / Support (ประคองเลน/ช่วยเหลือ)',
        heroes: ['Thane', 'Chaugnar', 'Grakk', 'Alice', 'Helen'],
        colorClass: 'text-teal-400 bg-teal-500/10 border-teal-500/20'
      };
    } else {
      return {
        role: 'Fighter / Marksman (เอนกประสงค์)',
        heroes: ['Omen', 'Maloch', 'Capheny', 'Valhein'],
        colorClass: 'text-sky-400 bg-sky-500/10 border-sky-500/20'
      };
    }
  }

  // Auto recommends Challenger skill based on selected hero
  function getRecommendedSkill(hero: RoVHero | null, oppHasCC: boolean) {
    if (!hero) return 'Flicker';
    const role = hero.primary_role;
    if (role === 'Assassin') return 'Punish (🔥)';
    if (role === 'Marksman') return oppHasCC ? 'Purify (🛡️)' : 'Flicker (💫)';
    if (role === 'Mage') return oppHasCC ? 'Purify (🛡️)' : 'Flicker (💫)';
    if (role === 'Tank' || role === 'Support') return oppHasCC ? 'Purify (🛡️)' : 'Heal (💚)';
    return 'Flicker (💫) / Execute (⚔️)';
  }

  // --- Telemetry Calculations ---
  // Calculates recommended early components
  function getEarlyComponentSuggestions(gold: number) {
    if (gold <= -3000) {
      return [
        { name: "Knight's Plate (เกราะกลาง)", desc: "ป้องกันกายภาพฉุกเฉินราคาประหยัด", gold: "730 ทอง" },
        { name: "Talisman (เหรียญกันเวทเล็ก)", desc: "ประหยัดทองเพื่อต้านทานตัวระเบิดเวท", gold: "430 ทอง" },
        { name: "Belt of Vitality (เข็มขัดเลือด)", desc: "เพิ่มค่าพลังชีวิตสุทธิเพื่อไม่ให้โดนคอมโบชุดเดียวตาย", gold: "800 ทอง" }
      ];
    } else if (gold >= 3000) {
      return [
        { name: "Astral Spear (หอกเจาะเกราะย่อย)", desc: "เสริมสโนว์บอลเพื่อตัดเลนป่าอย่างรวดเร็ว", gold: "800 ทอง" },
        { name: "Crit Ring (แหวนคริ)", desc: "เร่งเรตคริติคอลของแครี่เพื่อให้ไฟต์ฝั่งข้างจบไวขึ้น", gold: "400 ทอง" },
        { name: "Lapis Ring (แหวนเวทกลาง)", desc: "เร่งคูลดาวน์เวทเพื่อเสริมพลังโจมตีต่อเนื่อง", gold: "800 ทอง" }
      ];
    } else {
      return [
        { name: "Short Sword (ดาบเล็ก)", desc: "พื้นฐานสำหรับสายฟาร์มและแครี่", gold: "250 ทอง" },
        { name: "Spell Tome (สมุดเวท)", desc: "พื้นฐานเพื่อเพิ่มความสามารถการเคลียร์เวฟครีป", gold: "300 ทอง" },
        { name: "Magic Ring (แหวนคูลดาวน์)", desc: "เพิ่มคูลดาวน์ตั้งต้นเพื่อการกดดันในช่วงแรก", gold: "250 ทอง" }
      ];
    }
  }

  // Calculates recommended skill upgrade order
  function getSkillOrderSuggestion(gold: number) {
    if (gold <= -2000) {
      return "💡 แนะนำให้อัป [สกิล 1 นำ] สำหรับแทบทุกเลน เพื่อเน้นการโจมตี/เคลียร์ครีปจากระยะที่ปลอดภัยหลังป้อมโดยไม่ต้องเอาตัวเข้าปะทะ";
    } else {
      return "💡 แนะนำให้อัป [สกิล 2 นำ] เพื่อลดคูลดาวน์ของสกิลเคลื่อนที่ในการสร้างขอบเขตจู่โจมและยึดตัดพื้นที่ป่าของคู่แข่งทันที";
    }
  }

  const handleSwapMember = (oldUserId: string, newUserId: string) => {
    const newMemberDetail = allOrgMembers.find(m => m.user_id === newUserId);
    if (!newMemberDetail) return;
    setSwappedMembers(prev => prev.map(m => m.user_id === oldUserId ? newMemberDetail : m));
    showMsg('🔄 สลับตัวสมาชิกชั่วคราวสำเร็จ (สถานะจำลอง)', 'success');
  };

  const simProfiles = (swappedMembers || []).map(m => ({
    user_id: m.user_id,
    full_name: m.full_name,
    gender: m.gender || 'O',
    thai_element: m.thai_element || '',
    chinese_element: m.chinese_element || '',
    score_o: m.score_o ?? 3.0,
    score_c: m.score_c ?? 3.0,
    score_e: m.score_e ?? 3.0,
    score_a: m.score_a ?? 3.0,
    score_n: m.score_n ?? 3.0,
    quadrant_primary: m.quadrant_primary || 'Q1',
    jungian_type: m.jungian_type || 'TP',
    via_dominant: m.via_dominant || '',
    via_scores: m.via_scores || {},
    kwi: m.kwi || { vitality: 3.0, meaning: 3.0, connection: 3.0, mastery: 3.0, resilience: 3.0 },
    delta_tilt: m.delta_tilt || { anger: 0.0, aggression: 0.0 },
    activity_evaluations: m.activity_evaluations || [],
    has_conflict_risk: m.has_conflict_risk || false,
    conflict_risk_users: m.conflict_risk_users || []
  })) as unknown as SimProfile[];

  const synergyRes = calcTeamSynergy(simProfiles, 'rov');

  // Check if opponents have hard cc
  const oppHasHardCC = oppHeroIds
    .map(id => rovHeroes.find(h => h.id === id))
    .some(h => h?.tactical_tags?.includes('hard_cc'));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 md:p-8 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* 🌟 Head Banner */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full uppercase">
              Live Tactics Hub
            </span>
            {isSuperAdmin && (
              <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full uppercase">
                👑 Super Admin Access
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1 bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
            Esports Live War Room
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            ห้องบัญชาการกลยุทธ์เรียลไทม์ ประเมินดราฟต์ ออกแบบไอเทมย่อย และบอทที่ปรึกษาโค้ชระดับสูง (RoV Pilot Project)
          </p>
        </div>

        {/* --- Selection Matrix --- */}
        <div className="flex flex-wrap gap-2 bg-slate-900/40 p-2 rounded-2xl border border-slate-800 backdrop-blur-sm">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 font-bold uppercase pl-1">เลือกองค์กร</label>
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-indigo-500"
            >
              {organizations.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 font-bold uppercase pl-1">เซสชันกิจกรรม</label>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-indigo-500"
              disabled={sessions.length === 0}
            >
              {sessions.length === 0 ? (
                <option value="">ไม่มีเซสชันกิจกรรม</option>
              ) : (
                sessions.map(s => (
                  <option key={s.id} value={s.id}>{s.session_name}</option>
                ))
              )}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 font-bold uppercase pl-1">กลุ่มย่อย</label>
            <select
              value={selectedGroupNumber}
              onChange={(e) => setSelectedGroupNumber(e.target.value ? Number(e.target.value) : '')}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-indigo-500"
              disabled={groupNumbers.length === 0}
            >
              {groupNumbers.length === 0 ? (
                <option value="">ไม่มีกลุ่ม</option>
              ) : (
                groupNumbers.map(n => (
                  <option key={n} value={n}>กลุ่มที่ {n}</option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {/* --- Notification messages --- */}
      {msg.text && (
        <div className="max-w-7xl mx-auto mb-6">
          <div className={`p-3 rounded-xl text-xs border font-medium flex items-center gap-2 animate-fade-in ${
            msg.type === 'success' 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
          }`}>
            <span>{msg.type === 'success' ? '✅' : '❌'}</span>
            <span>{msg.text}</span>
          </div>
        </div>
      )}

      {/* --- Main 3-Panel Layout --- */}
      {selectedGroupNumber === '' ? (
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center p-16 text-center border border-dashed border-slate-800 rounded-3xl bg-slate-900/10">
          <span className="text-4xl mb-3">🎮</span>
          <h3 className="text-lg font-bold text-white">ยังไม่ได้เลือกกลุ่มย่อย</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-sm">
            กรุณาเลือกองค์กร เซสชัน และกลุ่มย่อยด้านบนเพื่อโหลดห้องส่งสัญญาณ Live War Room สด
          </p>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ========================================================= */}
          {/* PANEL 1 (Left): Live Draft & Synergy Analyzer (Col-Span 4) */}
          {/* ========================================================= */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 backdrop-blur-md relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-2xl rounded-full" />
              
              <div className="flex justify-between items-center mb-4 border-b border-slate-800/80 pb-3">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <span>👥 Panel 1: Live Draft</span>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">
                    Synergy: {synergyRes.synergy}%
                  </span>
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {role === 'coach' ? '🛡️ สิทธิ์ Coach (PDPA)' : '👑 สิทธิ์ Admin'}
                </span>
              </div>

              {swappedMembers.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">ไม่มีสมาชิกที่จับกลุ่มในรอบกิจกรรมนี้</p>
              ) : (
                <div className="space-y-4">
                  {swappedMembers.map((member) => {
                    const selectedHero = rovHeroes.find(h => h.id === teamHeroIds[member.user_id]);
                    const suggestion = getHeroFitSuggestion(member);
                    const suggestedSkill = getRecommendedSkill(selectedHero || null, oppHasHardCC);

                    const voiceState = memberVoiceStates[member.user_id];
                    const isMonitoring = activeVoiceMemberId === member.user_id;

                    return (
                      <div 
                        key={member.user_id} 
                        className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 space-y-2 hover:border-slate-700 transition"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-bold text-slate-200 text-xs flex flex-wrap items-center gap-1.5">
                              <span>{member.full_name}</span>
                              {voiceState && (
                                <span className={`px-1.5 py-0.2 rounded text-[8px] font-black border ${
                                  voiceState.state === 'TILT' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                  voiceState.state === 'HYPE' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                                  voiceState.state === 'DEJECTED' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                }`}>
                                  VVI: {voiceState.vvi} ({voiceState.state})
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                              {role === 'coach' ? (
                                <span className="text-[9px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded blur-[0.5px] select-none" title="Access Denied — ข้อมูลถูกปกป้องตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (RBAC Shielded Interpreter)">
                                  🔒 [ซ่อนข้อมูลสุขภาวะรายบุคคล]
                                </span>
                              ) : (
                                member.archetype ? `${member.archetype} (${member.quadrant_primary || 'Q1'})` : 'ไม่มีผลประเมิน'
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  if (activeVoiceMemberId === member.user_id) {
                                    setActiveVoiceMemberId(null);
                                  } else {
                                    setActiveVoiceMemberId(member.user_id);
                                    showMsg(`🎙️ เริ่มตรวจจับและวิเคราะห์สัญญาณเสียงแบบเรียลไทม์ของ ${member.full_name} แล้ว (Transient Memory)`, 'success');
                                  }
                                }}
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 transition ${
                                  isMonitoring 
                                    ? 'bg-rose-600/25 text-rose-400 border border-rose-500/40' 
                                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-slate-200'
                                }`}
                              >
                                <span>🎙️</span> {isMonitoring ? 'ยกเลิก' : 'วิเคราะห์เสียงสด'}
                              </button>
                            </div>
                          </div>
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold border ${suggestion.colorClass}`}>
                            {suggestion.role}
                          </span>
                        </div>

                        {/* Monitored Wave Visualizer */}
                        {isMonitoring && (
                          <div className="flex items-center gap-1.5 bg-slate-900/60 p-2 rounded-lg border border-indigo-900/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                            <span className="text-[9px] font-bold text-slate-400">Live Voice telemetry:</span>
                            <div className="flex gap-0.5 items-end h-2.5 overflow-hidden ml-1">
                              <div className="w-0.5 bg-indigo-500 animate-bounce" style={{ height: '60%', animationDelay: '0.1s' }}></div>
                              <div className="w-0.5 bg-indigo-400 animate-bounce" style={{ height: '100%', animationDelay: '0.3s' }}></div>
                              <div className="w-0.5 bg-indigo-500 animate-bounce" style={{ height: '40%', animationDelay: '0.2s' }}></div>
                              <div className="w-0.5 bg-indigo-600 animate-bounce" style={{ height: '80%', animationDelay: '0.5s' }}></div>
                            </div>
                            <span className="text-[8px] text-slate-500 ml-auto">
                              Pitch: {voiceState?.pitch || '1.0'}x | Rate: {voiceState?.rate || '1.0'}x | NegDensity: {voiceState?.negativeDensity || '0.0'}
                            </span>
                          </div>
                        )}

                        {/* AI-Generated Quick Macros for Monitored Players under stress */}
                        {voiceState && (voiceState.state === 'TILT' || voiceState.state === 'DEJECTED') && (
                          <div className="space-y-1 mt-1 bg-rose-950/20 p-2 rounded-lg border border-rose-900/30">
                            <div className="text-[9px] text-rose-300 font-bold flex items-center gap-1">
                              <span>⚠️ AI คำนวณความเสี่ยงพฤติกรรม:</span> {voiceState.macroAdvice}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                showMsg(`📣 ส่งปุ่มลัดสั่งการยุทธศาสตร์ด่วน [${voiceState.macroLabel}] ไปยัง ${member.full_name} แล้ว`, 'success');
                              }}
                              className="w-full py-1 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-md text-[9px] tracking-wide animate-pulse shadow-md transition flex items-center justify-center gap-1"
                            >
                              <span>📢</span> คอลสายด่วนโค้ช: {voiceState.macroLabel}
                            </button>
                          </div>
                        )}

                        {/* Hero Select Dropdown */}
                        <div className="flex gap-2 items-center">
                          <span className="text-[10px] text-slate-500 font-semibold w-12">เลือกฮีโร่:</span>
                          <select
                            value={teamHeroIds[member.user_id] || ''}
                            onChange={(e) => {
                              setTeamHeroIds(prev => ({ ...prev, [member.user_id]: e.target.value }));
                            }}
                            className="bg-slate-950 border border-slate-800 text-[11px] text-indigo-200 px-2 py-1 rounded-md focus:outline-none focus:border-indigo-500 flex-1"
                          >
                            <option value="">-- เลือกฮีโร่ --</option>
                            {rovHeroes.map(h => (
                              <option key={h.id} value={h.id}>{h.hero_name_en} ({h.primary_role})</option>
                            ))}
                          </select>
                        </div>

                        {/* Swap Member Sandbox Control */}
                        <div className="flex gap-2 items-center">
                          <span className="text-[10px] text-slate-500 font-semibold w-12">สลับตัว:</span>
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleSwapMember(member.user_id, e.target.value);
                              }
                            }}
                            defaultValue=""
                            className="bg-slate-950 border border-slate-800 text-[10px] text-slate-300 px-2 py-1 rounded-md focus:outline-none focus:border-indigo-500 flex-1"
                          >
                            <option value="" disabled>-- เลือกสลับสมาชิกชั่วคราว --</option>
                            {allOrgMembers
                              .filter(om => !swappedMembers.some(sm => sm.user_id === om.user_id))
                              .map(om => (
                                <option key={om.user_id} value={om.user_id}>{om.full_name}</option>
                              ))
                            }
                          </select>
                        </div>

                        {/* AI Hero Fit recommendation */}
                        <div className="p-1.5 bg-slate-900/40 rounded-lg text-[9px] text-slate-400 leading-normal">
                          💡 **ฮีโร่ที่เข้ากัน:** {suggestion.heroes.join(', ')}
                        </div>

                        {/* Challenger Skill Suggestion */}
                        <div className="flex justify-between items-center text-[9px] text-slate-400 bg-slate-900/30 p-1.5 rounded-lg">
                          <span>🎯 สกิลแนะนำ:</span>
                          <span className="text-indigo-400 font-semibold">{suggestedSkill}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ========================================================== */}
          {/* PANEL 2 (Center): Telemetry & Counter Engine (Col-Span 4) */}
          {/* ========================================================== */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 backdrop-blur-md relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 blur-2xl rounded-full" />
              
              <div className="flex justify-between items-center mb-4 border-b border-slate-800/80 pb-3">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <span>📊 Panel 2: Live Telemetry</span>
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  แก้ทาง & ไอเทมย่อย
                </span>
              </div>

              {/* Macro Team Vulnerability Aggregation (Zero-Trust Blurred View) */}
              <div className="space-y-3 mb-6 bg-slate-950/60 p-3 rounded-xl border border-slate-850">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                  <span>📊 สถิติความเสี่ยงภาพรวมทีม (Macro Metrics)</span>
                  <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded uppercase">
                    🔒 Zero-Trust Blurred
                  </span>
                </h4>
                
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800 text-center">
                    <div className="text-[9px] text-slate-500 font-bold uppercase">ดัชนีความเปราะบางมหาภาค</div>
                    <div className="text-sm font-extrabold text-indigo-400 mt-1">
                      {macroVulnerability !== null ? `${macroVulnerability.toFixed(2)} / 5.0` : '3.00'}
                    </div>
                    <div className="text-[8px] text-slate-500 mt-0.5">บดบังด้วย Deterministic Noise</div>
                  </div>
                  <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800 text-center">
                    <div className="text-[9px] text-slate-500 font-bold uppercase">ความมั่นคงสมาธิภาพรวม</div>
                    <div className="text-sm font-extrabold text-teal-400 mt-1">
                      {teamFocusStability !== null ? `${teamFocusStability.toFixed(1)}%` : '60.0%'}
                    </div>
                    <div className="text-[8px] text-slate-500 mt-0.5">ค่าเฉลี่ยสลัวรายกลุ่มองค์กร</div>
                  </div>
                </div>
              </div>

              {/* Opponents Selection Slots */}
              <div className="space-y-3 mb-6 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">🎯 ดราฟต์ของฝั่งตรงข้าม (Opponent Draft)</h4>
                
                {oppHeroIds.map((id, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <span className="text-[10px] text-slate-500 font-bold w-12">สล็อตที่ {index + 1}:</span>
                    <select
                      value={id}
                      onChange={(e) => {
                        const newIds = [...oppHeroIds];
                        newIds[index] = e.target.value;
                        setOppHeroIds(newIds);
                      }}
                      className="bg-slate-950 border border-slate-800 text-[11px] text-slate-200 px-2 py-1 rounded-md focus:outline-none focus:border-amber-500 flex-1"
                    >
                      <option value="">-- ว่าง --</option>
                      {rovHeroes.map(h => (
                        <option key={h.id} value={h.id}>{h.hero_name_en} ({h.primary_role})</option>
                      ))}
                    </select>
                  </div>
                ))}

                {oppHasHardCC && (
                  <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg text-[10px] text-rose-400 leading-tight">
                    🚨 <strong>ตรวจพบภัยคุกคาม CC หนาแน่น:</strong> ศัตรูมีตัวละคร Hard CC แนะนำให้สมาชิกเลือกหยิบสกิล Purify หรือรองเท้าต้านทานเวท Gilded Greaves
                  </div>
                )}
              </div>

              {/* Live Game Telemetry Sliders */}
              <div className="space-y-4 mb-6 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">⏱️ สถานะสดในเกม (Live Status)</h4>
                
                {/* Game Minute */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>นาทีในเกม:</span>
                    <span className="font-bold text-white">{gameMinute} นาที</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="35"
                    value={gameMinute}
                    onChange={(e) => setGameMinute(Number(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                {/* Gold Difference */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>ผลต่างทอง (ฝั่งเรา):</span>
                    <span className={`font-bold ${goldDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {goldDiff >= 0 ? `+${goldDiff}` : goldDiff} ทอง
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-12000"
                    max="12000"
                    step="500"
                    value={goldDiff}
                    onChange={(e) => setGoldDiff(Number(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <div className="flex justify-between text-[8px] text-slate-500 pl-1 pr-1">
                    <span>เสียเปรียบลึก (-12k)</span>
                    <span>เสมอ</span>
                    <span>ได้เปรียบลึก (+12k)</span>
                  </div>
                </div>
              </div>

              {/* Dynamic Telemetry Results */}
              <div className="space-y-4">
                <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-2">
                  <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                    <span>🛠️ ชิ้นส่วนไอเทมย่อยระยะแรก (Early Component Path)</span>
                  </h4>
                  <div className="space-y-2">
                    {getEarlyComponentSuggestions(goldDiff).map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start border-b border-slate-900 pb-1.5 last:border-b-0 last:pb-0">
                        <div>
                          <div className="text-[11px] font-semibold text-slate-200">{item.name}</div>
                          <div className="text-[9px] text-slate-500 mt-0.5">{item.desc}</div>
                        </div>
                        <span className="text-[10px] font-bold text-indigo-400">{item.gold}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 text-[10px] text-slate-300">
                  <h4 className="font-bold text-indigo-400 uppercase tracking-wider mb-1">
                    📖 ลำดับการอัปเกรดเลเวลสกิล
                  </h4>
                  <p className="leading-normal">{getSkillOrderSuggestion(goldDiff)}</p>
                </div>
              </div>

              {/* Save State Action */}
              <button
                onClick={handleSaveTelemetry}
                className="w-full mt-5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:scale-[0.98] text-white text-xs font-bold py-2 rounded-xl transition-all border border-indigo-500/20 shadow-lg"
              >
                💾 บันทึกสถานะการจำลองไว้เบื้องหลัง
              </button>
            </div>
          </div>

          {/* ======================================================== */}
          {/* PANEL 3 (Right): Live Chatbot & Telemetry Feed (Col-Span 4) */}
          {/* ======================================================== */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 backdrop-blur-md relative flex flex-col h-[680px]">
              
              <div className="flex justify-between items-center mb-3 border-b border-slate-800/80 pb-3">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <span>💬 Panel 3: Live Coach Feedback</span>
                </h3>
                <button
                  onClick={handleResetChat}
                  className="text-[9px] font-bold px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
                >
                  ล้างแชต
                </button>
              </div>

              {/* Chat Message Window */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
                {chatHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                    <span className="text-3xl mb-2">💬</span>
                    <p className="font-semibold text-slate-400">คุยกลยุทธ์ฉุกเฉิน</p>
                    <p className="text-[10px] mt-1 text-slate-500 max-w-[200px] leading-tight">
                      พิมพ์จำลองสถานการณ์ยุทธศาสตร์สด เพื่อให้ AI Strategy Gateway ส่งคำตอบทันที
                    </p>
                  </div>
                ) : (
                  chatHistory.map((chat, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl border leading-relaxed ${
                        chat.role === 'user'
                          ? 'bg-indigo-500/10 text-slate-200 border-indigo-500/20 ml-6'
                          : 'bg-slate-950/90 text-slate-300 border-slate-800 mr-6'
                      }`}
                    >
                      <div className="font-bold text-[9px] text-slate-500 mb-1">
                        {chat.role === 'user' ? '👤 COACH UPDATES' : '🧠 AI STRATEGY ADVISOR'}
                      </div>
                      <div className="whitespace-pre-wrap leading-tight">{chat.content}</div>
                    </div>
                  ))
                )}
                {chatLoading && (
                  <div className="bg-slate-950/90 text-slate-400 border border-slate-800 mr-6 p-2.5 rounded-xl flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                    <span className="text-[9px] ml-1">โค้ชใหญ่กำลังคิดแผนแก้เกมสด...</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input Area */}
              <div className="mt-3 pt-3 border-t border-slate-800">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendChatMessage();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="พิมพ์ส่งฟีดแบ็กเกมสด เช่น เงินตาม 3000..."
                    disabled={chatLoading}
                    className="bg-slate-950 border border-slate-800 text-xs text-slate-200 px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500 flex-1"
                  />
                  <button
                    type="submit"
                    disabled={chatLoading || !chatInput.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition disabled:opacity-55"
                  >
                    ส่ง
                  </button>
                </form>
              </div>

            </div>
          </div>

        </div>
      )}
      {/* 🔒 Zero-Trust Frosted Glass Lock Screen */}
      {isLocked && (
        <div className="fixed inset-0 z-[999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900/90 border border-indigo-950 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl space-y-4">
            <div className="text-4xl text-indigo-400">🔒</div>
            <h3 className="text-lg font-black text-white">ล็อกหน้าจอความปลอดภัย</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              ระบบล็อกหน้าจออัตโนมัติเพื่อป้องกันข้อมูลสุขภาวะองค์กรภายนอกรั่วไหล กรุณากดปุ่มด้านล่างเพื่อปลดล็อกเซสชันการทำงานของคุณ
            </p>
            <button
              onClick={() => {
                setIsLocked(false);
                showMsg('🔓 ปลดล็อกเซสชันสำเร็จ', 'success');
              }}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all"
            >
              🔓 ปลดล็อกเซสชัน
            </button>
          </div>
        </div>
      )}
      
    </div>
  );
}
