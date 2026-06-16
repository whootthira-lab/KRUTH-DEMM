'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { SimProfile, RoVHero, calcPredictedResourceGreed, calcPredictedResourceSharing } from '@/lib/scoring';

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
  
  // Feedback messages
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' | '' }>({ text: '', type: '' });
  const chatEndRef = useRef<HTMLDivElement>(null);

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
    }
  }, [selectedOrgId]);

  // Load group numbers when session changes
  useEffect(() => {
    if (selectedSessionId) {
      loadGroupNumbers(selectedSessionId);
      setSelectedGroupNumber('');
      setMembers([]);
    }
  }, [selectedSessionId]);

  // Load members and telemetry when group is selected
  useEffect(() => {
    if (selectedSessionId && selectedGroupNumber !== '') {
      loadGroupData();
    }
  }, [selectedSessionId, selectedGroupNumber]);

  // --- Functions ---
  async function checkAdminRole() {
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
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  ทีมฝั่งเรา
                </span>
              </div>

              {members.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">ไม่มีสมาชิกที่จับกลุ่มในรอบกิจกรรมนี้</p>
              ) : (
                <div className="space-y-4">
                  {members.map((member) => {
                    const selectedHero = rovHeroes.find(h => h.id === teamHeroIds[member.user_id]);
                    const suggestion = getHeroFitSuggestion(member);
                    const suggestedSkill = getRecommendedSkill(selectedHero || null, oppHasHardCC);

                    return (
                      <div 
                        key={member.user_id} 
                        className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 space-y-2 hover:border-slate-700 transition"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-bold text-slate-200 text-xs">{member.full_name}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {member.archetype ? `${member.archetype} (${member.quadrant_primary})` : 'ไม่มีผลประเมิน'}
                            </div>
                          </div>
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold border ${suggestion.colorClass}`}>
                            {suggestion.role}
                          </span>
                        </div>

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
      
    </div>
  );
}
