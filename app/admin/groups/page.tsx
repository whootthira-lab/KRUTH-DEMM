'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  calcTeamSynergy,
  calcRoVMatchCapability,
  calcCombatDominance,
  SimProfile
} from '@/lib/scoring';

interface Org {
  id: string;
  name: string;
  org_code: string;
}

interface Member {
  user_id: string;
  role: string;
  full_name: string;
  gender: string;
  thai_element?: string;
  chinese_element?: string;
  archetype: string;
  quadrant: string;
  score_o?: number;
  score_c?: number;
  score_e?: number;
  score_a?: number;
  score_n?: number;
  quadrant_primary?: string;
  via_dominant?: string;
  via_scores?: Record<string, number>;
  jungian_type?: string;
  jungian_scores?: Record<string, number>;
  pdcr_fire?: number;
  pdcr_wind?: number;
  pdcr_water?: number;
  pdcr_earth?: number;
  pdcr_dominant?: string;
  kwi?: {
    vitality: number;
    meaning: number;
    connection: number;
    mastery: number;
    resilience: number;
  };
  delta_tilt?: {
    anger: number;
    aggression: number;
  };
}

// Helpers for delta_tilt calculation and JSON parsing
function parseDeltaTilt(message: string) {
  if (!message) return { anger: 0.0, aggression: 0.0 };
  const swearWords = /เฮงซวย|แม่ง|เหี้ย|สัตว์|ควาย|fucking|shitty/gi;
  const insultWords = /ด่า|โง่|ทุเรศ|บ้า|เลว|กระจอก/gi;
  const threatWords = /ขู่|ทำร้าย|จะฆ่า|คอยดู|ระวังตัว/gi;
  const angryWords = /โกรธ|โมโห|เดือด|ฉุน/g;
  const frustratedWords = /รำคาญ|เหนื่อยแล้ว|เบื่อ|เซ็ง/g;
  const impatientWords = /ช้า|รีบ|ไวๆ|ด่วน/g;

  const fSwear = (message.match(swearWords) || []).length;
  const fInsult = (message.match(insultWords) || []).length;
  const fThreat = (message.match(threatWords) || []).length;
  const fAngry = (message.match(angryWords) || []).length;
  const fFrustrated = (message.match(frustratedWords) || []).length;
  const fImpatient = (message.match(impatientWords) || []).length;

  return {
    anger: 0.5 * fAngry + 0.3 * fFrustrated + 0.2 * fImpatient,
    aggression: 0.5 * fSwear + 0.3 * fInsult + 0.2 * fThreat
  };
}

const parseJsonField = (field: any) => {
  if (typeof field === 'string') {
    try { return JSON.parse(field); } catch { return {}; }
  }
  return field || {};
};

const getRecommendedRole = (jungian: string) => {
  if (!jungian) return null;
  if (jungian.includes('TJ')) return { role: 'PM / Shot Caller', color: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' };
  if (jungian.includes('FJ')) return { role: 'Facilitator / Morale Booster', color: 'bg-teal-500/10 text-teal-400 border border-teal-500/20' };
  return null;
};

const getMemberComeback = (m: Member) => {
  const r = m.kwi?.resilience ?? 3.0;
  const n = m.score_n ?? 3.0;
  const t = m.via_scores?.T ?? 3.0;
  const dt = (m.delta_tilt?.anger || 0.0) * (m.delta_tilt?.aggression || 0.0);
  return Math.max(1.0, Math.min(5.0, (0.4 * r + 0.3 * (5 - n) + 0.3 * t) - 0.2 * dt));
};

const projectTypes = [
  { value: 'innovation', label: '💡 โครงการนวัตกรรมและวิจัย (Innovation & R&D)' },
  { value: 'execution', label: '🎯 โครงการส่งมอบงานด่วน (Execution & Operations)' },
  { value: 'crisis_management', label: '🛡️ จัดการภาวะวิกฤต (Crisis Management)' },
  { value: 'cohesion', label: '🤝 เชื่อมสัมพันธ์พนักงาน (Cohesion & PR)' },
  { value: 'rov', label: '🎮 จำลองอีสปอร์ต RoV (Esports Match)' },
  { value: 'combat', label: '🥊 จำลองกีฬาบุคคลต่อสู้ (Combat Sports)' },
];

interface Session {
  id: string;
  session_name: string;
  created_at: string;
}

interface Assignment {
  user_id: string;
  group_number: number;
}

export default function AdminGroupsPage() {
  const router = useRouter();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  
  const [members, setMembers] = useState<Member[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [newSessionName, setNewSessionName] = useState<string>('');
  
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [analyzingGroupNo, setAnalyzingGroupNo] = useState<number | null>(null);

  const [selectedProjectType, setSelectedProjectType] = useState<string>('innovation');
  const [oppFirePct, setOppFirePct] = useState<number>(30);
  const [oppAggression, setOppAggression] = useState<number>(2.5);
  const [combatFighterId, setCombatFighterId] = useState<string>('');
  const [oppElement, setOppElement] = useState<string>('Fire');
  const [oppAggressionCombat, setOppAggressionCombat] = useState<number>(2.5);
  const [oppNCombat, setOppNCombat] = useState<number>(3.0);
  const [selectedLeaderId, setSelectedLeaderId] = useState<string>('');

  const [rovHeroes, setRovHeroes] = useState<any[]>([]);
  const [selectedHeroIds, setSelectedHeroIds] = useState<Record<string, string>>({});
  const [oppHeroIds, setOppHeroIds] = useState<string[]>(['', '', '', '', '']);

  async function loadRovHeroes() {
    try {
      const { data, error } = await supabase.from('rov_knowledge_heroes').select('*').order('hero_name_en');
      if (error) throw error;
      setRovHeroes(data || []);
    } catch (e: any) {
      console.error('Error loading RoV heroes:', e.message);
    }
  }

  // Load organizations and check access on mount
  useEffect(() => {
    const email = localStorage.getItem('kruth_admin_email');
    const role = localStorage.getItem('kruth_admin_role');
    const orgId = localStorage.getItem('kruth_admin_org_id');

    if (!email || (role !== 'org_admin' && role !== 'super_admin')) {
      router.push('/admin');
      return;
    }

    const superCheck = role === 'super_admin';
    setIsSuperAdmin(superCheck);

    if (!superCheck) {
      if (orgId) {
        setSelectedOrgId(orgId);
      } else {
        router.push('/admin');
        return;
      }
    }

    loadOrgs();
    loadRovHeroes();
  }, []);

  // Load members and sessions when selected organization changes
  useEffect(() => {
    if (selectedOrgId) {
      loadMembersAndSessions();
    } else {
      setMembers([]);
      setSessions([]);
      setSelectedSessionId('');
      setAssignments([]);
    }
  }, [selectedOrgId]);

  // Load assignments when selected session changes
  useEffect(() => {
    if (selectedSessionId) {
      loadAssignments();
    } else {
      setAssignments([]);
    }
  }, [selectedSessionId]);

  // Initialize Fighter and Leader selections when the modal opens
  useEffect(() => {
    if (analyzingGroupNo !== null) {
      const peers = groupedMembers[analyzingGroupNo] || [];
      if (peers.length > 0) {
        setCombatFighterId(peers[0].user_id);
        setSelectedLeaderId(peers[0].user_id);
      }
    }
  }, [analyzingGroupNo]);

  async function loadOrgs() {
    setLoadingOrgs(true);
    try {
      const { data, error } = await supabase.from('organizations').select('*').order('name');
      if (error) throw error;
      setOrgs(data || []);
    } catch (e: any) {
      showMsg('เกิดข้อผิดพลาดในการโหลดหน่วยงาน: ' + e.message, 'error');
    } finally {
      setLoadingOrgs(false);
    }
  }

  async function loadMembersAndSessions() {
    setLoadingMembers(true);
    setLoadingSessions(true);
    try {
      // 1. Fetch members
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
        .eq('org_id', selectedOrgId);
      if (mErr) throw mErr;

      const parsedMembers: Member[] = (mData || []).map((m: any) => ({
        user_id: m.user_id,
        role: m.role || 'member',
        full_name: m.users?.full_name || 'ไม่ทราบชื่อ',
        gender: m.users?.gender || 'O',
        thai_element: m.users?.thai_element || '',
        chinese_element: m.users?.chinese_element || '',
        archetype: '',
        quadrant: ''
      }));

      // 2. Fetch test results for these members to get their archetype
      if (parsedMembers.length > 0) {
        const userIds = parsedMembers.map(m => m.user_id);
        const { data: rData, error: rErr } = await supabase
          .from('results')
          .select(`
            user_id,
            archetype_name_th,
            quadrant_primary,
            score_o,
            score_c,
            score_e,
            score_a,
            score_n,
            via_dominant,
            via_scores,
            jungian_type,
            jungian_scores,
            pdcr_fire,
            pdcr_wind,
            pdcr_water,
            pdcr_earth,
            pdcr_dominant
          `)
          .in('user_id', userIds)
          .order('created_at', { ascending: false });
          
        if (!rErr && rData) {
          // Keep only latest result for each user
          const latestResults: Record<string, any> = {};
          rData.forEach(r => {
            if (!latestResults[r.user_id]) {
              latestResults[r.user_id] = r;
            }
          });

          parsedMembers.forEach(m => {
            const r = latestResults[m.user_id];
            if (r) {
              m.archetype = r.archetype_name_th;
              m.quadrant = r.quadrant_primary;
              m.score_o = r.score_o;
              m.score_c = r.score_c;
              m.score_e = r.score_e;
              m.score_a = r.score_a;
              m.score_n = r.score_n;
              m.quadrant_primary = r.quadrant_primary;
              m.via_dominant = r.via_dominant;
              m.via_scores = parseJsonField(r.via_scores);
              m.jungian_type = r.jungian_type;
              m.jungian_scores = parseJsonField(r.jungian_scores);
              m.pdcr_fire = r.pdcr_fire;
              m.pdcr_wind = r.pdcr_wind;
              m.pdcr_water = r.pdcr_water;
              m.pdcr_earth = r.pdcr_earth;
              m.pdcr_dominant = r.pdcr_dominant;
            }
          });
        }

        // 2b. Fetch KWI responses for these members
        const { data: kData, error: kErr } = await supabase
          .from('kwi_responses')
          .select('user_id, vitality, meaning, connection, mastery, resilience, taken_at')
          .in('user_id', userIds)
          .order('taken_at', { ascending: false });

        if (!kErr && kData) {
          const latestKwi: Record<string, any> = {};
          kData.forEach(k => {
            if (!latestKwi[k.user_id]) {
              latestKwi[k.user_id] = k;
            }
          });

          parsedMembers.forEach(m => {
            if (latestKwi[m.user_id]) {
              m.kwi = {
                vitality: latestKwi[m.user_id].vitality || 0,
                meaning: latestKwi[m.user_id].meaning || 0,
                connection: latestKwi[m.user_id].connection || 0,
                mastery: latestKwi[m.user_id].mastery || 0,
                resilience: latestKwi[m.user_id].resilience || 0,
              };
            }
          });
        }

        // 2c. Fetch latest router_cognitive_logs for these members (limit 1 per user)
        const tiltPromises = userIds.map(async (uid) => {
          try {
            const { data, error } = await supabase
              .from('router_cognitive_logs')
              .select('user_message')
              .eq('user_id', uid)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (!error && data && data.user_message) {
              const scored = parseDeltaTilt(data.user_message);
              return { uid, tilt: scored };
            }
          } catch (e) {
            console.error("Error loading tilt for user:", uid, e);
          }
          return { uid, tilt: { anger: 0.0, aggression: 0.0 } };
        });

        const tiltResults = await Promise.all(tiltPromises);
        const latestTilt: Record<string, { anger: number; aggression: number }> = {};
        tiltResults.forEach(res => {
          latestTilt[res.uid] = res.tilt;
        });

        parsedMembers.forEach(m => {
          if (latestTilt[m.user_id]) {
            m.delta_tilt = latestTilt[m.user_id];
          } else {
            m.delta_tilt = { anger: 0.0, aggression: 0.0 };
          }
        });
      }

      setMembers(parsedMembers);

      // 3. Fetch sessions
      const { data: sData, error: sErr } = await supabase
        .from('group_sessions')
        .select('*')
        .eq('org_id', selectedOrgId)
        .order('created_at', { ascending: false });
      if (sErr) throw sErr;

      setSessions(sData || []);
      setSelectedSessionId('');
      setAssignments([]);
    } catch (e: any) {
      showMsg('เกิดข้อผิดพลาดในการโหลดข้อมูลสมาชิก: ' + e.message, 'error');
    } finally {
      setLoadingMembers(false);
      setLoadingSessions(false);
    }
  }

  async function loadAssignments() {
    try {
      const { data, error } = await supabase
        .from('group_assignments')
        .select('user_id, group_number')
        .eq('session_id', selectedSessionId);
      if (error) throw error;
      setAssignments(data || []);
    } catch (e: any) {
      showMsg('เกิดข้อผิดพลาดในการโหลดข้อมูลการจับกลุ่ม: ' + e.message, 'error');
    }
  }

  async function handleCreateSession() {
    if (!newSessionName.trim()) {
      showMsg('กรุณากรอกชื่อเซสชัน', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const { data, error } = await supabase
        .from('group_sessions')
        .insert({
          org_id: selectedOrgId,
          session_name: newSessionName.trim()
        })
        .select('*')
        .single();
      if (error) throw error;

      setSessions(prev => [data, ...prev]);
      setSelectedSessionId(data.id);
      setNewSessionName('');
      showMsg('สร้างรอบกิจกรรมสำเร็จ', 'success');
    } catch (e: any) {
      showMsg('เกิดข้อผิดพลาดในการสร้างเซสชัน: ' + e.message, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  // Smart Auto-grouping algorithm (Groups of 2-3 members, no singletons)
  function handleAutoGroup() {
    if (members.length < 2) {
      showMsg('สมาชิกมีน้อยเกินไป ไม่สามารถจัดกลุ่มย่อยได้ (ต้องการอย่างน้อย 2 คน)', 'error');
      return;
    }

    // Shuffle members
    const shuffled = [...members].sort(() => Math.random() - 0.5);
    const newAssignments: Assignment[] = [];
    
    let currentGroup = 1;
    let i = 0;
    const len = shuffled.length;

    while (i < len) {
      const remaining = len - i;
      let groupSize = 3; // default size

      if (remaining === 4) {
        groupSize = 2; // split remaining 4 into 2 and 2
      } else if (remaining === 2) {
        groupSize = 2;
      }

      const groupMembers = shuffled.slice(i, i + groupSize);
      groupMembers.forEach(m => {
        newAssignments.push({
          user_id: m.user_id,
          group_number: currentGroup
        });
      });

      currentGroup++;
      i += groupSize;
    }

    setAssignments(newAssignments);
    showMsg(`สุ่มจัดกลุ่มสมาชิกสำเร็จ แบ่งได้ ${currentGroup - 1} กลุ่ม (กลุ่มละ 2-3 คน)`, 'success');
  }

  async function handleSaveAssignments() {
    if (!selectedSessionId) {
      showMsg('กรุณาเลือกหรือสร้างรอบกิจกรรมก่อน', 'error');
      return;
    }
    setActionLoading(true);
    try {
      // 1. Delete existing assignments
      const { error: delErr } = await supabase
        .from('group_assignments')
        .delete()
        .eq('session_id', selectedSessionId);
      if (delErr) throw delErr;

      // 2. Insert new ones
      if (assignments.length > 0) {
        const rows = assignments.map(a => ({
          session_id: selectedSessionId,
          group_number: a.group_number,
          user_id: a.user_id
        }));

        const { error: insErr } = await supabase
          .from('group_assignments')
          .insert(rows);
        if (insErr) throw insErr;
      }

      showMsg('บันทึกการจัดกลุ่มย่อยสำเร็จแล้ว', 'success');
    } catch (e: any) {
      showMsg('เกิดข้อผิดพลาดในการบันทึก: ' + e.message, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  function handleManualChangeGroup(userId: string, groupNum: number) {
    setAssignments(prev => {
      const filtered = prev.filter(a => a.user_id !== userId);
      if (groupNum > 0) {
        return [...filtered, { user_id: userId, group_number: groupNum }].sort((a, b) => a.group_number - b.group_number);
      }
      return filtered;
    });
  }

  function showMsg(text: string, type: 'success' | 'error') {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  }

  const getGroupAnalysis = (groupNo: number) => {
    const peers = groupedMembers[groupNo] || [];
    if (peers.length === 0) return null;

    let vSum = 0, mSum = 0, cSum = 0, maSum = 0, rSum = 0;
    let countedKwi = 0;

    peers.forEach(p => {
      if (p.kwi) {
        vSum += p.kwi.vitality;
        mSum += p.kwi.meaning;
        cSum += p.kwi.connection;
        maSum += p.kwi.mastery;
        rSum += p.kwi.resilience;
        countedKwi++;
      }
    });

    const hasKwi = countedKwi > 0;
    const avg = {
      vitality: hasKwi ? Math.round((vSum / countedKwi) * 10) / 10 : 3.0,
      meaning: hasKwi ? Math.round((mSum / countedKwi) * 10) / 10 : 3.0,
      connection: hasKwi ? Math.round((cSum / countedKwi) * 10) / 10 : 3.0,
      mastery: hasKwi ? Math.round((maSum / countedKwi) * 10) / 10 : 3.0,
      resilience: hasKwi ? Math.round((rSum / countedKwi) * 10) / 10 : 3.0,
    };

    const quads = peers.map(p => p.quadrant).filter(Boolean);
    const qCount = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    quads.forEach(q => {
      if (q in qCount) qCount[q as keyof typeof qCount]++;
    });

    let synergyType = 'กลุ่มประสานพลังทั่วไป (Neutral Synergy)';
    let synergyDesc = 'กลุ่มมีความหลากหลายสมดุลดีในการสื่อสารและการทำงานร่วมกัน';
    let strengths = ['มีความพร้อมและเปิดรับคำแนะนำแนวทางใหม่ๆ', 'สมาชิกมีความเข้าใจและปรับตัวเข้าหากันได้ดี'];
    let cautions = ['ควรระมัดระวังเรื่องการกำหนดเป้าหมายและการแบ่งงานให้ชัดเจน'];
    let delegationTips = 'แนะนำให้เน้นการทำงานร่วมกันแบบกระชับสัมพันธ์ โดยแบ่งหน้าที่ตามจุดแข็งของสไตล์บุคลิกภาพแต่ละคน';

    const hasQ1 = qCount.Q1 > 0;
    const hasQ2 = qCount.Q2 > 0;
    const hasQ3 = qCount.Q3 > 0;
    const hasQ4 = qCount.Q4 > 0;

    if (hasQ1 && hasQ4 && !hasQ2 && !hasQ3) {
      synergyType = '⚡ กลุ่มนวัตกรรมและจินตนาการขับเคลื่อน (Dynamic Innovators)';
      synergyDesc = 'กลุ่มที่ประกอบด้วยนักสำรวจ (Q1) และผู้สร้างสรรค์ (Q4) เป็นหลัก มีพลังในการคิดค้นไอเดียริเริ่มสิ่งใหม่ๆ ได้อย่างรวดเร็วและกระตือรือร้นสูง';
      strengths = [
        'ริเริ่มความคิดสร้างสรรค์ได้ยอดเยี่ยม มีมุมมองนอกกรอบ',
        'มีความคล่องตัวสูง ลุยงานเร็ว และปรับเปลี่ยนแนวทางได้รวดเร็ว'
      ];
      cautions = [
        'อาจละเลยรายละเอียดขั้นตอนที่มีความละเอียดอ่อนสูง',
        'หากไม่มีผู้ประสานงาน (Q3) หรือนักคิด (Q2) กลุ่มอาจขาดการกำหนดเป้าหมายเชิงระบบและมีโอกาสเบิร์นเอาท์ได้ง่าย'
      ];
      delegationTips = 'ควรระบุเป้าหมายกว้างๆ แล้วให้อิสระในการออกแบบแผนงาน หลีกเลี่ยงการควบคุมควบคุมมากเกินไป แต่ควรจัดตั้งเป้าหมายย่อยเพื่อติดตามความสำเร็จเป็นระยะ';
    } else if (hasQ2 && hasQ3 && !hasQ1 && !hasQ4) {
      synergyType = '🛡️ กลุ่มเสถียรภาพและวิเคราะห์ประคอง (Structured Supporters)';
      synergyDesc = 'กลุ่มที่เน้นนักคิด (Q2) และผู้ประสาน (Q3) มีความระมัดระวัง รอบคอบ และใส่ใจบรรยากาศภายในทีมเป็นอันดับแรก';
      strengths = [
        'มีระบบระเบียบในกระบวนการทำงานสูง ทำงานที่มีความซับซ้อนได้ดี',
        'มีความสามัคคีและดูแลรักษาน้ำใจกันอย่างอบอุ่น ลดความขัดแย้งเชิงลบ'
      ];
      cautions = [
        'ตัดสินใจช้าเนื่องจากต้องการความมั่นใจในข้อมูลสูง',
        'อาจจะกังวลกับการเปลี่ยนแปลงแนวทางใหม่ๆ และขาดแรงผลักดันเชิงรุก'
      ];
      delegationTips = 'ควรมอบหมายงานที่มีรูปแบบชัดเจน มีขั้นตอนแน่นอน หรือเป็นงานประเมินความเสี่ยง และช่วยสนับสนุนให้พวกเขากล้าแสดงความเห็นคิดเห็นแปลกใหม่โดยสร้างพื้นที่ปลอดภัย';
    } else if (hasQ1 && hasQ2 && !hasQ3 && !hasQ4) {
      synergyType = '🎯 กลุ่มวิสัยทัศน์และการวางแผนเชิงระบบ (Strategic Thinkers)';
      synergyDesc = 'การบรรจบกันของนักสำรวจ (Q1) และนักคิด (Q2) โฟกัสไปที่เป้าหมายใหญ่และการวิเคราะห์ผลอย่างมีหลักการ';
      strengths = [
        'มีความสามารถในการคิดแผนกลยุทธ์ระยะยาว',
        'วิเคราะห์ข้อดีข้อเสียอย่างเป็นระบบก่อนตัดสินใจลุย'
      ];
      cautions = [
        'อาจจะทุ่มเทเวลาให้กับการถกเถียงเชิงทฤษฎีมากเกินไป',
        'อาจขาดการดูแลความรู้สึกสมาชิกภายในกลุ่ม (Connection)'
      ];
      delegationTips = 'มอบหมายงานประเภทวิเคราะห์ข้อมูล แผนโครงการ หรือการประเมินวิสัยทัศน์เชิงกลยุทธ์ พร้อมตั้งเดดไลน์ที่ชัดเจนเพื่อตัดวงจรการคิดวิเคราะห์ซ้ำซ้อน';
    } else if (hasQ3 && hasQ4 && !hasQ1 && !hasQ2) {
      synergyType = '🌟 กลุ่มสร้างสรรค์สัมพันธ์และดูแลความรู้สึก (Expressive Collaborators)';
      synergyDesc = 'การผสมผสานของผู้ประสาน (Q3) และผู้สร้างสรรค์ (Q4) มุ่งเน้นไปที่ประสบการณ์ของคน บรรยากาศ และศิลปะการทำงานร่วมกัน';
      strengths = [
        'สร้างบรรยากาศบวกและการมีส่วนร่วมได้ยอดเยี่ยม',
        'แก้ไขปัญหาความเข้าใจผิดและการสื่อสารภายในกลุ่มได้อย่างนุ่มนวล'
      ];
      cautions = [
        'อาจหลุดโฟกัสจากเป้าหมายผลลัพธ์ที่เป็นตัวเลขหรือประสิทธิภาพหลัก',
        'มีความอ่อนไหวสูงเมื่อต้องมีการประเมินผลงานแบบตรงไปตรงมา'
      ];
      delegationTips = 'มอบหมายงานประเภทงานประชาสัมพันธ์ กิจกรรมสร้างการมีส่วนร่วม นำเสนอความเห็น หรืออกแบบสื่อสารสร้างความเข้าใจ โดยช่วยเป็นคนช่วยตบกรอบทิศทางให้อยู่ในเส้นทาง';
    } else if (qCount.Q1 >= 2) {
      synergyType = '🚀 กลุ่มหัวหอกรวดเร็วและผจญภัย (Fast Explorers)';
      synergyDesc = 'มีนักสำรวจ (Q1) เกินกว่ากึ่งหนึ่งของกลุ่ม กลุ่มมีทิศทางกระตือรือร้นและต้องการผลลัพธ์อย่างรวดเร็ว';
      strengths = [
        'พร้อมทดลองแนวทางใหม่ๆ ทันทีโดยไม่ลังเล',
        'แก้ปัญหาเฉพาะหน้าเก่งมาก'
      ];
      cautions = [
        'ขาดความต่อเนื่องในงานที่ต้องทำซ้ำๆ หรือต้องการความละเอียด',
        'อาจเกิดจุดชนของอีโก้ในการนำทางเดิน'
      ];
      delegationTips = 'มอบหมายงานที่มีความท้ายทายสูง แก้ปัญหาเร่งด่วน หรือบุกเบิกตลาด/ขั้นตอนใหม่ และให้คนคอยช่วยเก็บรายละเอียดปลีกย่อยตามหลัง';
    } else if (qCount.Q2 >= 2) {
      synergyType = '🔬 กลุ่มผู้เชี่ยวชาญวิเคราะห์เชิงลึก (Deep Analysts)';
      synergyDesc = 'มีนักคิด (Q2) เป็นแกนหลัก เน้นความแม่นยำ ข้อมูลเชิงลึก และความถูกต้องของหลักการ';
      strengths = [
        'คุณภาพผลงานประเมินสูง มีความน่าเชื่อถือทางวิชาการ/หลักการ',
        'มองเห็นจุดผิดพลาดเล็กๆ ที่คนอื่นละเลย'
      ];
      cautions = [
        'อาจจะเกิดภาวะติดหล่มการวิเคราะห์ (Analysis Paralysis)',
        'การสื่อสารกับบุคคลภายนอกอาจเข้าใจยากหรือมีศัพท์เฉพาะทางสูง'
      ];
      delegationTips = 'มอบหมายงานวิจัย พัฒนาระบบตรวจสอบ ตรวจทานสัญญา หรือประมวลผลสถิติ และแนะนำให้จัดโครงสร้างช่วงเวลาการแบ่งปันความคืบหน้าสม่ำเสมอ';
    } else if (qCount.Q3 >= 2) {
      synergyType = '🤝 กลุ่มผู้ประสานใจสามัคคี (Empathic Coordinators)';
      synergyDesc = 'เน้นการดูแลสายสัมพันธ์ (Connection) ความปลอดภัยทางจิตวิทยา และความเป็นหนึ่งเดียวในกลุ่ม';
      strengths = [
        'ความขัดแย้งในกลุ่มต่ำมาก สมาชิกให้เกียรติและรับฟังกันอย่างดี',
        'เป็นที่ยึดเหนี่ยวใจในการทำงานร่วมกันยามวิกฤต'
      ];
      cautions = [
        'อาจเลี่ยงความขัดแย้งที่มีประโยชน์ต่อการทำงาน (Healthy Conflict)',
        'เกรงใจกันเกินไปจนทำให้งานไม่คืบหน้าตามเป้าหมายหลัก'
      ];
      delegationTips = 'มอบหมายงานที่ต้องดูแลลูกค้าสัมพันธ์ ประสานงานความขัดแย้ง หรือประสานประโยชน์ระหว่างหน่วยงาน และควรมีผู้บริหารช่วยกำหนดเป้าหมายเชิงรุกและกระตุ้นการกระทำ';
    } else if (qCount.Q4 >= 2) {
      synergyType = '🎨 กลุ่มไอเดียระเบิดนอกกรอบ (Artistic Creators)';
      synergyDesc = 'มีผู้สร้างสรรค์ (Q4) เป็นผู้นำกลุ่ม กลุ่มนี้เต็มไปด้วยความแปลกใหม่ จินตนาการ และวิธีการทำงานที่หลากหลาย';
      strengths = [
        'ผลผลิตงานออกแบบหรืองานสร้างสรรค์มีเอกลักษณ์โดดเด่น',
        'มีมุมมองปฏิวัติวงการในการทำงานเดิมๆ'
      ];
      cautions = [
        'การทำงานอาจไร้ทิศทางและควบคุมเวลาได้ยากลำบาก',
        'อาจอึดอัดกับกฎเกณฑ์ขององค์กรอย่างเห็นได้ชัด'
      ];
      delegationTips = 'มอบงานสร้างสรรค์ แคมเปญโฆษณา การจัดนิทรรศการ หรือออกแบบผลิตภัณฑ์ และควรช่วยคุมเดดไลน์และสถิติด้านงบประมาณอย่างรัดกุม';
    }

    return {
      avg,
      hasKwi,
      synergyType,
      synergyDesc,
      strengths,
      cautions,
      delegationTips,
      peers
    };
  };

  async function handleSaveSimulation(groupNo: number) {
    if (!selectedOrgId) return;
    const peers = groupedMembers[groupNo] || [];
    if (peers.length === 0) return;
    
    setActionLoading(true);
    try {
      const simProfiles = peers as unknown as SimProfile[];
      const synergyRes = calcTeamSynergy(simProfiles, selectedProjectType);
      
      let finalSynergy = synergyRes.synergy;
      let friction = 'GREEN';
      if (finalSynergy < 40) friction = 'RED';
      else if (finalSynergy < 60) friction = 'ORANGE';
      else if (finalSynergy < 75) friction = 'YELLOW';
 
      if (selectedProjectType === 'rov') {
        const selectedHeroesMap: Record<string, any> = {};
        simProfiles.forEach(m => {
          const heroId = selectedHeroIds[m.user_id];
          selectedHeroesMap[m.user_id] = rovHeroes.find(h => h.id === heroId) || null;
        });
        const opponentHeroesList = oppHeroIds.map(id => rovHeroes.find(h => h.id === id) || null);

        const rovRes = calcRoVMatchCapability(
          synergyRes.synergy,
          synergyRes.comeback,
          { element_fire_pct: oppFirePct, aggression: oppAggression },
          simProfiles,
          selectedHeroesMap,
          opponentHeroesList
        );
        finalSynergy = rovRes.capability;
      } else if (selectedProjectType === 'combat') {
        const fighter = simProfiles.find(p => p.user_id === combatFighterId);
        if (fighter) {
          const oppFighter: SimProfile = {
            user_id: 'opponent',
            full_name: 'Opponent Fighter',
            chinese_element: oppElement,
            score_n: oppNCombat,
            delta_tilt: { anger: oppAggressionCombat, aggression: oppAggressionCombat }
          };
          const combatRes = calcCombatDominance(fighter, oppFighter);
          finalSynergy = combatRes.dominance;
        }
      }
 
      const userIds = peers.map(m => m.user_id);
      
      const selectedHIds = selectedProjectType === 'rov'
        ? userIds.map(uid => selectedHeroIds[uid]).filter(id => !!id)
        : [];
      const opponentHIds = selectedProjectType === 'rov'
        ? oppHeroIds.filter(id => !!id)
        : [];

      const insertData: any = {
        org_id: selectedOrgId,
        leader_id: selectedLeaderId || peers[0]?.user_id || '',
        selected_user_ids: userIds,
        project_type: selectedProjectType,
        calculated_synergy: finalSynergy,
        friction_risk_level: friction,
        bot_recommendation: `ประเภทโครงการ: ${selectedProjectType}, ระดับความประสานงานของทีม: ${finalSynergy}%, ศักยภาพหลัก: ${synergyRes.taskPotential.toFixed(2)}, Comeback Potential: ${synergyRes.comeback.toFixed(2)}`
      };

      if (selectedProjectType === 'rov') {
        insertData.selected_hero_ids = selectedHIds;
        insertData.opponent_hero_ids = opponentHIds;
      }

      const { error } = await supabase.from('group_simulations').insert(insertData);
 
      if (error) throw error;
      showMsg('บันทึกผลการจำลองกลุ่มสำเร็จแล้ว!', 'success');
      setAnalyzingGroupNo(null);
    } catch (e: any) {
      showMsg('เกิดข้อผิดพลาดในการบันทึกจำลองกลุ่ม: ' + e.message, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  // Helper to group assignments
  const groupedMembers: Record<number, Member[]> = {};
  assignments.forEach(a => {
    const member = members.find(m => m.user_id === a.user_id);
    if (member) {
      if (!groupedMembers[a.group_number]) groupedMembers[a.group_number] = [];
      groupedMembers[a.group_number].push(member);
    }
  });

  const unassignedMembers = members.filter(
    m => !assignments.some(a => a.user_id === m.user_id)
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 font-sans text-gray-800">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-[#1A3A5C] rounded-2xl p-6 text-white shadow-lg">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-1 flex items-center gap-2">
              <span>👥</span> ผู้ควบคุม: จัดกลุ่มย่อย
            </h1>
            <p className="text-sm text-blue-200">แบ่งกลุ่มเวิร์กชอป (2-3 คน) สำหรับประเมินความเข้ากันได้</p>
          </div>
          <Link href="/admin/dashboard" className="mt-4 md:mt-0 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm font-bold transition-colors">
            📊 ไปแผงควบคุมหลัก
          </Link>
        </div>

        {/* Status Messages */}
        {message && (
          <div className={`p-4 rounded-xl text-sm font-bold shadow-sm transition-all animate-fade-in ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.type === 'success' ? '✅ ' : '❌ '} {message.text}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          
          {/* Left Column: Organization & Session selector */}
          <div className="space-y-6 md:col-span-1">
            
            {/* Org Selector */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
              <h3 className="font-bold text-[#1A3A5C] text-lg border-b pb-2">🏢 เลือกหน่วยงาน</h3>
              
              {loadingOrgs ? (
                <div className="text-center py-4 text-gray-400">กำลังโหลดหน่วยงาน...</div>
              ) : (
                <select 
                  value={selectedOrgId} 
                  onChange={e => setSelectedOrgId(e.target.value)} 
                  disabled={!isSuperAdmin}
                  className="w-full border rounded-lg p-2.5 text-sm bg-gray-50 focus:border-[#1A3A5C] outline-none disabled:bg-gray-100 disabled:text-gray-500"
                >
                  <option value="">— เลือกหน่วยงาน —</option>
                  {orgs.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Session selector / creator */}
            {selectedOrgId && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                <h3 className="font-bold text-[#1A3A5C] text-lg border-b pb-2">📅 เลือกหรือสร้างรอบกิจกรรม</h3>
                
                {loadingSessions ? (
                  <div className="text-center py-4 text-gray-400">กำลังโหลดรอบกิจกรรม...</div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-500">เลือกเซสชันที่มีอยู่:</label>
                      <select 
                        value={selectedSessionId} 
                        onChange={e => setSelectedSessionId(e.target.value)} 
                        className="w-full border rounded-lg p-2.5 text-sm bg-gray-50 focus:border-[#1A3A5C] outline-none"
                      >
                        <option value="">— เลือกรอบกิจกรรม —</option>
                        {sessions.map(s => (
                          <option key={s.id} value={s.id}>{s.session_name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="border-t pt-4 space-y-2">
                      <label className="text-xs font-semibold text-gray-500 block">สร้างรอบกิจกรรมใหม่:</label>
                      <input 
                        value={newSessionName}
                        onChange={e => setNewSessionName(e.target.value)}
                        placeholder="เช่น เวิร์กชอปวันจันทร์ บ่าย" 
                        className="w-full border rounded-lg p-2 text-sm bg-gray-50 outline-none focus:border-[#1A3A5C]" 
                      />
                      <button 
                        onClick={handleCreateSession}
                        disabled={actionLoading}
                        className="w-full py-2.5 bg-[#1A3A5C] text-white rounded-lg text-xs font-bold hover:bg-opacity-90 transition-opacity disabled:bg-gray-400"
                      >
                        {actionLoading ? 'กำลังสร้าง...' : '➕ สร้างรอบใหม่'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Right Columns: Members and Subgroups */}
          <div className="md:col-span-2 space-y-6">
            
            {selectedOrgId ? (
              <>
                {/* Controls (visible when session is selected) */}
                {selectedSessionId ? (
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap gap-3 items-center justify-between">
                    <div className="text-sm">
                      <span className="text-gray-400">รอบที่กำลังจัดการ:</span>{' '}
                      <strong className="text-[#1A3A5C]">
                        {sessions.find(s => s.id === selectedSessionId)?.session_name}
                      </strong>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAutoGroup}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
                      >
                        🎲 จัดกลุ่มย่อยอัตโนมัติ
                      </button>
                      <button
                        onClick={handleSaveAssignments}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm disabled:bg-gray-400"
                      >
                        {actionLoading ? 'กำลังบันทึก...' : '💾 บันทึกการจับกลุ่ม'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-2xl text-center text-sm font-semibold">
                    ⚠️ กรุณาเลือกหรือสร้างรอบกิจกรรมก่อน เพื่อเริ่มต้นการจับกลุ่มย่อย
                  </div>
                )}

                {/* Subgroup Assignments Dashboard */}
                {selectedSessionId && (
                  <div className="grid md:grid-cols-2 gap-6">
                    
                    {/* Groups Cards List */}
                    <div className="space-y-4">
                      <h3 className="font-bold text-[#1A3A5C] text-lg flex items-center gap-2">
                        <span>📦</span> กลุ่มที่จัดแล้ว ({Object.keys(groupedMembers).length} กลุ่ม)
                      </h3>

                      {Object.keys(groupedMembers).map(groupNoStr => {
                        const groupNo = parseInt(groupNoStr);
                        const groupPeers = groupedMembers[groupNo];
                        return (
                          <div key={groupNo} className="bg-white p-5 rounded-2xl shadow-sm border border-blue-100 space-y-3">
                            <div className="flex justify-between items-center border-b pb-2">
                              <span className="font-bold text-[#1A3A5C] text-sm bg-blue-50 px-2.5 py-1 rounded-full">
                                👥 กลุ่มย่อยที่ {groupNo}
                              </span>
                              <span className="text-xs text-gray-400 font-semibold">{groupPeers.length} คน</span>
                            </div>

                            <div className="space-y-2">
                              {groupPeers.map(m => (
                                <div key={m.user_id} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg text-xs">
                                  <div className="min-w-0">
                                    <div className="font-bold text-gray-800 truncate">{m.full_name}</div>
                                    <div className="text-[0.65rem] text-gray-400 truncate">
                                      {m.archetype ? `${m.archetype} (${m.quadrant})` : 'ยังไม่ได้ทำแบบทดสอบ'}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleManualChangeGroup(m.user_id, 0)}
                                    className="text-red-500 hover:text-red-600 font-bold px-2 py-1"
                                  >
                                    ออก
                                  </button>
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => setAnalyzingGroupNo(groupNo)}
                              className="w-full mt-2 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-[0.7rem] font-bold transition-colors shadow-sm flex items-center justify-center gap-1.5"
                            >
                              <span>⚡</span> วิเคราะห์แนวโน้มและบริการกลุ่ม
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                window.location.href = `/coach/war-room?orgId=${selectedOrgId}&sessionId=${selectedSessionId}&groupNumber=${groupNo}`;
                              }}
                              className="w-full mt-1.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[0.7rem] font-bold transition-colors shadow-sm flex items-center justify-center gap-1.5"
                            >
                              <span>🎮</span> เข้าสู่ Live War Room
                            </button>
                          </div>
                        );
                      })}

                      {Object.keys(groupedMembers).length === 0 && (
                        <div className="bg-white p-8 rounded-2xl border border-dashed text-center text-gray-400 text-sm">
                          ยังไม่มีกลุ่มย่อยถูกจัด <br/> กดปุ่ม &quot;จัดกลุ่มย่อยอัตโนมัติ&quot; หรือเลือกกลุ่มด้านขวาเพื่อเริ่มจับกลุ่ม
                        </div>
                      )}
                    </div>

                    {/* Members List (Unassigned / Manual Management) */}
                    <div className="space-y-4">
                      <h3 className="font-bold text-[#1A3A5C] text-lg">
                        <span>👥</span> สมาชิกทั้งหมด ({members.length} คน)
                      </h3>

                      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 text-xs font-bold text-gray-500 flex justify-between">
                          <span>ชื่อสมาชิก</span>
                          <span>ย้ายเข้ากลุ่ม</span>
                        </div>
                        <div className="divide-y max-h-[500px] overflow-y-auto">
                          {members.map(m => {
                            const assign = assignments.find(a => a.user_id === m.user_id);
                            return (
                              <div key={m.user_id} className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-gray-800 truncate">{m.full_name}</p>
                                  <p className="text-[0.65rem] text-gray-400 truncate">
                                    {m.archetype ? `${m.archetype} (${m.quadrant})` : 'ยังไม่ได้ทำแบบประเมิน'}
                                  </p>
                                </div>
                                <select
                                  value={assign?.group_number || 0}
                                  onChange={e => handleManualChangeGroup(m.user_id, parseInt(e.target.value))}
                                  className="border rounded px-2 py-1 text-xs outline-none focus:border-[#1A3A5C]"
                                >
                                  <option value={0}>— เลือกกลุ่ม —</option>
                                  {Array.from({ length: Math.ceil(members.length / 2) + 1 }, (_, index) => (
                                    <option key={index + 1} value={index + 1}>กลุ่ม {index + 1}</option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                          
                          {loadingMembers && (
                            <div className="p-8 text-center text-gray-400 text-sm">กำลังโหลดสมาชิก...</div>
                          )}
                          {!loadingMembers && members.length === 0 && (
                            <div className="p-8 text-center text-gray-400 text-sm">ไม่พบสมาชิกในหน่วยงานนี้</div>
                          )}
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </>
            ) : (
              <div className="bg-white p-12 rounded-2xl border text-center text-gray-400 flex flex-col justify-center items-center shadow-sm">
                <span className="text-5xl mb-4">🏢</span>
                <p className="text-base font-bold text-[#1A3A5C]">กรุณาเลือกหน่วยงานด้านซ้ายมือ</p>
                <p className="text-xs mt-1">เพื่อเริ่มต้นการจัดการรายชื่อและจัดกลุ่มย่อยสมาชิกในระบบ</p>
              </div>
            )}

          </div>

        </div>

        {/* 📊 Modal: ผลวิเคราะห์แนวโน้มและการบริหารกลุ่มย่อย */}
        {analyzingGroupNo !== null && (() => {
          const analysis = getGroupAnalysis(analyzingGroupNo);
          if (!analysis) return null;

          const peers = groupedMembers[analyzingGroupNo] || [];
          const simProfiles = peers as unknown as SimProfile[];
          const synergyRes = calcTeamSynergy(simProfiles, selectedProjectType);
          
          let displayScore = synergyRes.synergy;
          let displayLabel = 'ดัชนีประสานพลังทีม (Team Synergy)';
          let rovDetails = null;
          let combatDetails = null;
          
          if (selectedProjectType === 'rov') {
            const selectedHeroesMap: Record<string, any> = {};
            simProfiles.forEach(m => {
              const heroId = selectedHeroIds[m.user_id];
              selectedHeroesMap[m.user_id] = rovHeroes.find(h => h.id === heroId) || null;
            });
            const opponentHeroesList = oppHeroIds.map(id => rovHeroes.find(h => h.id === id) || null);

            const rovRes = calcRoVMatchCapability(
              synergyRes.synergy,
              synergyRes.comeback,
              { element_fire_pct: oppFirePct, aggression: oppAggression },
              simProfiles,
              selectedHeroesMap,
              opponentHeroesList
            );
            displayScore = rovRes.capability;
            displayLabel = 'ขีดความสามารถ (Esports Capability)';
            rovDetails = rovRes;
          } else if (selectedProjectType === 'combat') {
            const fighter = simProfiles.find(p => p.user_id === combatFighterId);
            if (fighter) {
              const oppFighter: SimProfile = {
                user_id: 'opponent',
                full_name: 'Opponent Fighter',
                chinese_element: oppElement,
                score_n: oppNCombat,
                delta_tilt: { anger: oppAggressionCombat, aggression: oppAggressionCombat }
              };
              const combatRes = calcCombatDominance(fighter, oppFighter);
              displayScore = combatRes.dominance;
              displayLabel = 'ดัชนีความเหนือกว่า (Combat Dominance)';
              combatDetails = combatRes;
            }
          }

          let friction = 'GREEN';
          let frictionText = 'ต่ำ (Low Friction)';
          let frictionBg = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
          if (displayScore < 40) {
            friction = 'RED';
            frictionText = 'วิกฤต (Critical Friction)';
            frictionBg = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
          } else if (displayScore < 60) {
            friction = 'ORANGE';
            frictionText = 'สูง (High Friction)';
            frictionBg = 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
          } else if (displayScore < 75) {
            friction = 'YELLOW';
            frictionText = 'ปานกลาง (Medium Friction)';
            frictionBg = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
          }

          return (
            <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-[#0f172a] text-slate-100 rounded-3xl max-w-5xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-800 flex flex-col p-6 animate-fade-in text-left">
                
                {/* Modal Header */}
                <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
                  <div>
                    <h3 className="text-xl font-black text-indigo-400 flex items-center gap-2">
                      <span>📊</span> เครื่องมือประเมินและจำลองฟอร์มทีม — กลุ่มย่อยที่ {analyzingGroupNo}
                    </h3>
                    <p className="text-xs text-slate-400">ระบบประมวลผลคำนวณจิตวิทยาและเบญจธาตุจีน (Wu Xing) สำหรับจัดสรรทีม</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAnalyzingGroupNo(null)}
                    className="text-slate-400 hover:text-slate-200 text-xl font-bold p-1 transition-colors"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto">
                  
                  {/* Left Column (Simulation Controls & Main HUD) */}
                  <div className="lg:col-span-5 space-y-6">
                    
                    {/* Mission Selector */}
                    <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-3">
                      <label className="text-xs font-bold text-slate-300 block">🎯 ประเภทภารกิจจำลอง (Simulation Mode)</label>
                      <select
                        value={selectedProjectType}
                        onChange={e => setSelectedProjectType(e.target.value)}
                        className="w-full border border-slate-700 bg-slate-800 rounded-lg p-2.5 text-xs text-slate-100 outline-none focus:border-indigo-500"
                      >
                        {projectTypes.map(pt => (
                          <option key={pt.value} value={pt.value}>{pt.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* HUD Gauge */}
                    <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80 flex flex-col items-center justify-center text-center space-y-4">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{displayLabel}</span>
                      
                      {/* Premium Circle SVG Gauge */}
                      <div className="relative w-32 h-32 flex items-center justify-center">
                        <svg className="absolute w-full h-full transform -rotate-90">
                          <circle cx="64" cy="64" r="54" className="stroke-slate-800" strokeWidth="8" fill="transparent" />
                          <circle
                            cx="64"
                            cy="64"
                            r="54"
                            className="stroke-indigo-500 transition-all duration-500"
                            strokeWidth="8"
                            fill="transparent"
                            strokeDasharray={2 * Math.PI * 54}
                            strokeDashoffset={2 * Math.PI * 54 * (1 - Math.min(100, displayScore) / 100)}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="flex flex-col items-center">
                          <span className="text-3xl font-black tracking-tight text-white">{displayScore}%</span>
                          <span className="text-[0.6rem] text-slate-400">Score</span>
                        </div>
                      </div>

                      {/* Info indicators */}
                      <div className="w-full grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-850">
                          <span className="text-[0.65rem] text-slate-500 block mb-0.5">Friction Risk</span>
                          <span className={`px-2 py-0.5 rounded-full text-[0.65rem] font-bold ${frictionBg}`}>
                            {frictionText}
                          </span>
                        </div>
                        <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-850">
                          <span className="text-[0.65rem] text-slate-500 block mb-0.5">Clutch Potential</span>
                          <span className="font-extrabold text-indigo-400">{synergyRes.comeback.toFixed(2)} / 5.0</span>
                        </div>
                      </div>
                    </div>

                    {/* Esports Controls Panel */}
                    {selectedProjectType === 'rov' && (
                      <div className="bg-slate-900/60 p-4.5 rounded-2xl border border-indigo-900/30 space-y-4">
                        <h4 className="text-xs font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                          <span>🎮</span> จำลองทีมคู่แข่ง Esports (RoV Match Simulator)
                        </h4>
                        
                        <div className="space-y-3 text-xs">
                          {/* Choose Heroes for our Team */}
                          <div className="space-y-2">
                            <label className="text-slate-300 font-semibold block">เลือกฮีโร่สำหรับสมาชิกในทีม (Your Team Heroes):</label>
                            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                              {simProfiles.map(m => (
                                <div key={m.user_id} className="flex justify-between items-center gap-2">
                                  <span className="text-slate-400 font-medium truncate max-w-[120px]">{m.full_name}</span>
                                  <select
                                    value={selectedHeroIds[m.user_id] || ''}
                                    onChange={e => {
                                      setSelectedHeroIds(prev => ({ ...prev, [m.user_id]: e.target.value }));
                                    }}
                                    className="flex-1 max-w-[180px] border border-slate-700 bg-[#0f172a] rounded-lg p-1 text-xs text-slate-100 outline-none"
                                  >
                                    <option value="">-- เลือกฮีโร่ --</option>
                                    {rovHeroes.map(h => (
                                      <option key={h.id} value={h.id}>{h.hero_name_en} ({h.primary_role})</option>
                                    ))}
                                  </select>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Choose Heroes for Opponent Team */}
                          <div className="space-y-2">
                            <label className="text-slate-300 font-semibold block">เลือกฮีโร่ทีมตรงข้าม (Opponent Team - 5 ฮีโร่):</label>
                            <div className="grid grid-cols-5 gap-1.5">
                              {oppHeroIds.map((val, idx) => (
                                <select
                                  key={idx}
                                  value={val}
                                  onChange={e => {
                                    const newOppHeroIds = [...oppHeroIds];
                                    newOppHeroIds[idx] = e.target.value;
                                    setOppHeroIds(newOppHeroIds);
                                  }}
                                  className="w-full border border-slate-700 bg-[#0f172a] rounded-lg p-1 text-[10px] text-slate-100 outline-none"
                                >
                                  <option value="">#{idx + 1}</option>
                                  {rovHeroes.map(h => (
                                    <option key={h.id} value={h.id}>{h.hero_name_en}</option>
                                  ))}
                                </select>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-1.5 border-t border-slate-800 pt-2">
                            <div className="flex justify-between font-semibold">
                              <span className="text-slate-300">สัดส่วนธาตุไฟฝั่งตรงข้าม (Opponent Fire %):</span>
                              <span className="text-indigo-400">{oppFirePct}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={oppFirePct}
                              onChange={e => setOppFirePct(parseInt(e.target.value))}
                              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex justify-between font-semibold">
                              <span className="text-slate-300">ความก้าวร้าวของคู่แข่ง (Opponent Aggression):</span>
                              <span className="text-indigo-400">{oppAggression.toFixed(1)} / 5.0</span>
                            </div>
                            <input
                              type="range"
                              min="1.0"
                              max="5.0"
                              step="0.1"
                              value={oppAggression}
                              onChange={e => setOppAggression(parseFloat(e.target.value))}
                              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                          </div>
                        </div>

                        {rovDetails && (
                          <div className="bg-indigo-950/20 p-3 rounded-xl border border-indigo-900/30 text-xs text-indigo-300/90 leading-relaxed space-y-1">
                            <div>
                              <strong>กลยุทธ์แก้ทาง (Tactical Counter Index):</strong> {(rovDetails.counterIndex * 100).toFixed(0)}%
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {rovDetails.counterIndex > 0.50
                                ? '🔥 ตรวจพบโอกาสแก้ทางฝั่งตรงข้าม! ทีมเรามีข้อดีเชิงยุทธศาสตร์ต้านทานแผนบุกหรือยกเลิกสถานะขัดขวางคู่แข่งได้เป็นอย่างดี (+0.25/0.50)'
                                : 'ทีมคู่แข่งไม่มีภัยคุกคามแก้ทางเด่นชัด หรือทีมเรายังขาดตำแหน่งรับมือ/ต้านสถานะควบคุมอย่างเหมาะสม'}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Combat Sports Controls Panel */}
                    {selectedProjectType === 'combat' && (
                      <div className="bg-slate-900/60 p-4.5 rounded-2xl border border-amber-900/30 space-y-4">
                        <h4 className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-1">
                          <span>🥊</span> จำลองปะทะบุคคล (Combat Sports Simulator)
                        </h4>

                        <div className="space-y-3 text-xs">
                          {/* Choose Fighter */}
                          <div className="space-y-1.5">
                            <label className="text-slate-300 font-semibold block">เลือกนักสู้ของทีมเรา (Fighter):</label>
                            <select
                              value={combatFighterId}
                              onChange={e => setCombatFighterId(e.target.value)}
                              className="w-full border border-slate-700 bg-[#0f172a] rounded-lg p-2 text-xs text-slate-100 outline-none"
                            >
                              {peers.map(m => (
                                <option key={m.user_id} value={m.user_id}>{m.full_name}</option>
                              ))}
                            </select>
                          </div>

                          <div className="border-t border-slate-800 pt-3 space-y-3">
                            <span className="text-[0.65rem] font-bold text-slate-500 uppercase tracking-wider block">คู่ต่อสู้จำลอง (Mock Opponent)</span>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[0.65rem] text-slate-400 block mb-1">ธาตุ (Element):</label>
                                <select
                                  value={oppElement}
                                  onChange={e => setOppElement(e.target.value)}
                                  className="w-full border border-slate-700 bg-[#0f172a] rounded p-1 text-xs text-slate-100 outline-none"
                                >
                                  <option value="Wood">ธาตุไม้ (Wood)</option>
                                  <option value="Fire">ธาตุไฟ (Fire)</option>
                                  <option value="Earth">ธาตุดิน (Earth)</option>
                                  <option value="Metal">ธาตุทอง (Metal)</option>
                                  <option value="Water">ธาตุน้ำ (Water)</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-[0.65rem] text-slate-400 block mb-1">กังวล (Neuroticism):</label>
                                <input
                                  type="number"
                                  min="1.0"
                                  max="5.0"
                                  step="0.1"
                                  value={oppNCombat}
                                  onChange={e => setOppNCombat(parseFloat(e.target.value))}
                                  className="w-full border border-slate-700 bg-[#0f172a] rounded p-1 text-xs text-slate-100 outline-none"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <div className="flex justify-between font-semibold">
                                <span className="text-[0.65rem] text-slate-300">ความดุดัน (Opponent Aggression):</span>
                                <span className="text-amber-400">{oppAggressionCombat.toFixed(1)}</span>
                              </div>
                              <input
                                type="range"
                                min="1.0"
                                max="5.0"
                                step="0.1"
                                value={oppAggressionCombat}
                                onChange={e => setOppAggressionCombat(parseFloat(e.target.value))}
                                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                              />
                            </div>
                          </div>
                        </div>

                        {combatDetails && (
                          <div className="bg-amber-950/20 p-3 rounded-xl border border-amber-900/30 text-xs text-amber-300/90 space-y-1">
                            <div><strong>Ego Penalty:</strong> {combatDetails.egoPenalty ? '🔴 ถูกลงทัณฑ์ประมาท (Ego Delusion) หักพลังลง 15%' : '✅ ไร้อาการหลงตัวเอง (ผ่านเกณฑ์ประเมินตนตามจริง)'}</div>
                            <div><strong>Style Multiplier:</strong> {combatDetails.styleMultiplier > 1.0 ? '🎯 ชนะทางสไตล์! ได้รับตัวคูณเปรียบมวยเชิงตั้งรับ 1.2x' : 'ทรงมวยปกติ (ไม่มีใครได้เปรียบสไตล์)'}</div>
                            <div><strong>Opponent Pressure:</strong> {combatDetails.pressure.toFixed(2)} / 5.0</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Simulation Save Panel */}
                    <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 block">👑 เลือกผู้นำกลุ่มจำลอง (Leader):</label>
                        <select
                          value={selectedLeaderId}
                          onChange={e => setSelectedLeaderId(e.target.value)}
                          className="w-full border border-slate-700 bg-[#0f172a] rounded-lg p-2 text-xs text-slate-100 outline-none"
                        >
                          {peers.map(m => (
                            <option key={m.user_id} value={m.user_id}>{m.full_name}</option>
                          ))}
                        </select>
                      </div>
                      
                      <button
                        onClick={() => handleSaveSimulation(analyzingGroupNo)}
                        disabled={actionLoading}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-md flex items-center justify-center gap-1.5 disabled:bg-slate-750"
                      >
                        {actionLoading ? 'กำลังประมวลผล...' : '💾 บันทึกการจำลองการฟอร์มทีม'}
                      </button>
                      {selectedProjectType === 'rov' && (
                        <button
                          type="button"
                          onClick={() => {
                            window.location.href = `/coach/war-room?orgId=${selectedOrgId}&sessionId=${selectedSessionId}&groupNumber=${analyzingGroupNo}`;
                          }}
                          className="w-full py-2.5 bg-indigo-800 hover:bg-indigo-750 text-white rounded-xl text-xs font-bold transition-colors shadow-md flex items-center justify-center gap-1.5 mt-2"
                        >
                          <span>🎮</span> เข้าสู่ Live War Room
                        </button>
                      )}
                    </div>

                  </div>

                  {/* Right Column (Members & Synergy Analysis) */}
                  <div className="lg:col-span-7 space-y-6">
                    
                    {/* Synergy Style */}
                    <div className="bg-gradient-to-br from-indigo-950/40 to-slate-950/40 p-4.5 rounded-2xl border border-indigo-900/30 space-y-1.5">
                      <span className="text-[0.65rem] font-bold text-indigo-400 uppercase tracking-wider block">สไตล์การทำงานประสานพลัง (Synergy Style)</span>
                      <h4 className="text-sm font-black text-white">{analysis.synergyType}</h4>
                      <p className="text-xs text-slate-300 leading-relaxed">{analysis.synergyDesc}</p>
                    </div>

                    {/* Members List with Role Suggestions & Badges */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">👥 วิเคราะห์บทบาทและตรารางวัลสมาชิกทีม</h4>
                      <div className="border border-slate-800 rounded-xl overflow-hidden text-xs">
                        <table className="w-full text-left">
                          <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="px-4 py-2.5">ชื่อพนักงาน</th>
                              <th className="px-4 py-2.5">ธาตุเกิด</th>
                              <th className="px-4 py-2.5">แนะนำบทบาท / ตราเกียรติยศ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 text-slate-300">
                            {peers.map((peer, i) => {
                              const recRole = getRecommendedRole(peer.jungian_type || '');
                              const comebackVal = getMemberComeback(peer);
                              const isTurnaround = comebackVal >= 4.2;
                              const buildRec = rovDetails?.buildRecommendations?.[peer.user_id];
                              const chosenHero = selectedHeroIds[peer.user_id]
                                ? rovHeroes.find(h => h.id === selectedHeroIds[peer.user_id])
                                : null;

                              return (
                                <tr key={i} className="hover:bg-slate-900/30">
                                  <td className="px-4 py-2.5">
                                    <div className="font-bold text-white">{peer.full_name}</div>
                                    <div className="text-[0.65rem] text-slate-500">
                                      {peer.archetype ? `${peer.archetype} (${peer.quadrant})` : 'ไม่มีผลประเมิน'}
                                    </div>
                                    {chosenHero && (
                                      <div className="text-[10px] text-indigo-400 font-semibold mt-0.5">
                                        🎮 {chosenHero.hero_name_en} ({chosenHero.primary_role})
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span className="text-slate-400">{peer.chinese_element || peer.thai_element || 'ไม่พบข้อมูล'}</span>
                                  </td>
                                  <td className="px-4 py-2.5 space-y-1">
                                    <div className="flex flex-wrap items-center gap-1">
                                      {recRole && (
                                        <span className={`inline-block px-2 py-0.5 rounded text-[0.6rem] font-bold ${recRole.color}`}>
                                          {recRole.role}
                                        </span>
                                      )}
                                      {isTurnaround && (
                                        <span className="inline-block px-2 py-0.5 rounded text-[0.6rem] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                          ☄️ Turnaround Master (Clutch: {comebackVal.toFixed(1)})
                                        </span>
                                      )}
                                      {!recRole && !isTurnaround && !buildRec && (
                                        <span className="text-slate-500">-</span>
                                      )}
                                    </div>
                                    {buildRec && (
                                      <div className="mt-1.5 p-1.5 bg-slate-950/80 rounded-lg border border-slate-800 text-[10px] text-slate-300 space-y-1">
                                        <div className="font-bold text-indigo-400">🛠️ {buildRec.buildName}</div>
                                        <div className="text-[9px] text-slate-400 leading-tight">
                                          <strong>ไอเทม:</strong> {buildRec.items.join(', ')}
                                        </div>
                                        <div className="text-[9px] text-slate-400 leading-tight">
                                          <strong>สกิล:</strong> {buildRec.skills.join(', ')} | <strong>รูน:</strong> {buildRec.runes?.join(', ') || 'ไม่มีแนะนำ'} | <strong>แท็ก:</strong> {buildRec.tags.join(', ')}
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      
                      {selectedProjectType === 'rov' && rovDetails && (
                        <div className="space-y-2">
                          {((rovDetails.rreAlerts && rovDetails.rreAlerts.length > 0) || 
                            (rovDetails.crsiAlerts && rovDetails.crsiAlerts.length > 0)) && (
                            <div className="p-3 bg-indigo-950/20 border border-indigo-900/30 rounded-xl space-y-1.5 text-xs text-indigo-300">
                              <h5 className="font-bold text-indigo-400 flex items-center gap-1.5">
                                <span>⚠️</span> สถิติตัวแปรพฤติกรรมในเลน (Lane Behavior Warnings)
                              </h5>
                              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300 pl-1">
                                {rovDetails.rreAlerts?.map((alert: string, idx: number) => (
                                  <li key={idx}>{alert}</li>
                                ))}
                                {rovDetails.crsiAlerts?.map((alert: string, idx: number) => (
                                  <li key={idx}>{alert}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* KWI Wellness Dimension Averages */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">📊 ดัชนีสุขภาวะเฉลี่ยของทีม (Wellness Indicators)</h4>
                      {analysis.hasKwi ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {[
                            { label: '🌟 พลังชีวิต (Vitality)', val: analysis.avg.vitality, color: 'bg-emerald-500' },
                            { label: '🧘 ความหมายชีวิต (Meaning)', val: analysis.avg.meaning, color: 'bg-indigo-500' },
                            { label: '💙 สายสัมพันธ์ (Connection)', val: analysis.avg.connection, color: 'bg-blue-500' },
                            { label: '🎯 การเติบโต (Mastery)', val: analysis.avg.mastery, color: 'bg-purple-500' },
                            { label: '🛡️ ความยืดหยุ่น (Resilience)', val: analysis.avg.resilience, color: 'bg-pink-500' },
                          ].map((dim, i) => (
                            <div key={i} className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 flex flex-col justify-between space-y-1">
                              <div className="flex justify-between items-center text-xs font-bold">
                                <span className="text-slate-400">{dim.label}</span>
                                <span className="text-white">{dim.val} / 5.0</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div className={`h-full ${dim.color}`} style={{ width: `${(dim.val / 5) * 100}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-slate-900/50 text-slate-400 border border-slate-800 p-4 rounded-xl text-center text-xs font-semibold">
                          ⚠️ สมาชิกในกลุ่มยังไม่มีผลประเมิน KWI (ระบบจึงดึงค่า Default 3.0 กลางๆ ให้ก่อนชั่วคราว)
                        </div>
                      )}
                    </div>

                    {/* Strengths & Cautions */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="bg-emerald-950/20 p-4 rounded-2xl border border-emerald-900/20 space-y-2">
                        <h5 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <span>✅</span> จุดแข็งประสานงานทีม
                        </h5>
                        <ul className="list-disc list-inside text-xs text-slate-300 space-y-1 pl-1 leading-relaxed">
                          {analysis.strengths.map((str, i) => (
                            <li key={i}>{str}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-rose-950/20 p-4 rounded-2xl border border-rose-900/20 space-y-2">
                        <h5 className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                          <span>⚠️</span> ข้อระวัง/อุปสรรคสำคัญ
                        </h5>
                        <ul className="list-disc list-inside text-xs text-slate-300 space-y-1 pl-1 leading-relaxed">
                          {analysis.cautions.map((cau, i) => (
                            <li key={i}>{cau}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Manager Guidelines */}
                    <div className="bg-slate-900/40 p-4.5 rounded-2xl border border-slate-800 space-y-2">
                      <h5 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                        <span>💡</span> แนวทางดูแลและบริการจัดการขององค์กร (Management Guidelines)
                      </h5>
                      <p className="text-xs text-slate-300 leading-relaxed">{analysis.delegationTips}</p>
                    </div>

                  </div>

                </div>

                {/* Footer buttons */}
                <div className="flex justify-end border-t border-slate-800 pt-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setAnalyzingGroupNo(null)}
                    className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors shadow-md"
                  >
                    ปิดแผงประเมิน
                  </button>
                </div>

              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
