'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';

interface Organization {
  id: string;
  name: string;
  org_code: string;
  created_at: string;
  admin_email?: string;
}

interface LevelBarProps {
  label: string;
  counts: Record<string, number>;
  total: number;
}

// Custom Component for Clinical Indicators (Detailed view)
function LevelBar({ label, counts, total }: LevelBarProps) {
  const green = counts['🟢'] || 0;
  const yellow = counts['🟡'] || 0;
  const orange = counts['🟠'] || 0;
  const red = counts['🔴'] || 0;

  const pctG = total > 0 ? Math.round((green / total) * 100) : 0;
  const pctY = total > 0 ? Math.round((yellow / total) * 100) : 0;
  const pctO = total > 0 ? Math.round((orange / total) * 100) : 0;
  const pctR = total > 0 ? Math.round((red / total) * 100) : 0;

  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 space-y-3 backdrop-blur-md shadow-lg">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-slate-200">{label}</span>
        <span className="text-[10px] text-slate-400">ผู้ประเมิน {total} คน</span>
      </div>
      
      {/* Stacked bar */}
      <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex">
        {pctG > 0 && <div className="bg-emerald-500 h-full" style={{ width: `${pctG}%` }} title={`ปกติ/เสี่ยงต่ำ: ${pctG}%`} />}
        {pctY > 0 && <div className="bg-amber-400 h-full" style={{ width: `${pctY}%` }} title={`เฝ้าระวัง: ${pctY}%`} />}
        {pctO > 0 && <div className="bg-orange-500 h-full" style={{ width: `${pctO}%` }} title={`เสี่ยงสูง: ${pctO}%`} />}
        {pctR > 0 && <div className="bg-rose-600 h-full" style={{ width: `${pctR}%` }} title={`เสี่ยงวิกฤต: ${pctR}%`} />}
      </div>

      {/* Legend with counts & percentages */}
      <div className="grid grid-cols-4 gap-1 text-[8.5px] font-bold text-slate-300">
        <div className="flex flex-col items-center border-r border-slate-800/80">
          <span className="text-emerald-400">🟢 ปกติ</span>
          <span>{green} ({pctG}%)</span>
        </div>
        <div className="flex flex-col items-center border-r border-slate-800/80">
          <span className="text-amber-400">🟡 ระวัง</span>
          <span>{yellow} ({pctY}%)</span>
        </div>
        <div className="flex flex-col items-center border-r border-slate-800/80">
          <span className="text-orange-400">🟠 เสี่ยงสูง</span>
          <span>{orange} ({pctO}%)</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-rose-500">🔴 วิกฤต</span>
          <span>{red} ({pctR}%)</span>
        </div>
      </div>
    </div>
  );
}

export default function SuperDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all');
  const [stats, setStats] = useState({ totalUsers: 0, totalOrgs: 0 });
  const [kwiData, setKwiData] = useState<any[]>([]);
  const [quadrantData, setQuadrantData] = useState<any[]>([]);
  
  // States for Clinical Signals
  const [clinicalStats, setClinicalStats] = useState<Record<string, Record<string, number>>>({
    rain: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
    bolt: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
    fog: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
    socialanxiety: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
    ocd: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
    burnout: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
    adhd: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
    delusion: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
  });

  const [brightTypeData, setBrightTypeData] = useState<any[]>([]);
  const [brightFlagData, setBrightFlagData] = useState<any[]>([]);
  
  // States for Energy & Numerology
  const [energyData, setEnergyData] = useState<any[]>([]);
  const [energyKeywordsData, setEnergyKeywordsData] = useState<any[]>([]);

  // Form States
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgCode, setNewOrgCode] = useState('');
  const [assignEmail, setAssignEmail] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Meta-AI Patch States
  const [metaPatch, setMetaPatch] = useState<any>(null);
  const [loadingPatch, setLoadingPatch] = useState(false);
  const [submittingPatch, setSubmittingPatch] = useState(false);

  async function loadMetaPatch() {
    setLoadingPatch(true);
    try {
      const res = await fetch('/api/admin/meta-ai');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setMetaPatch(data.patch);
        }
      }
    } catch (err) {
      console.error("Error loading Meta-AI patch:", err);
    } finally {
      setLoadingPatch(false);
    }
  }

  async function handleApprovePatch() {
    if (!metaPatch) return;
    setSubmittingPatch(true);
    try {
      const res = await fetch('/api/admin/meta-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvedBy: localStorage.getItem('kruth_admin_email') || 'whootthira@gmail.com',
          patchVersion: metaPatch.patchVersion,
          signatureHex: `signed-sig-hash-${Date.now()}`
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setMessage({ text: `อนุมัติการเปิดใช้งานสูตรแม่แบบ ${metaPatch.patchVersion} สำเร็จ ปรับโครงสร้างสูตรและลงบันทึกระบบเรียบร้อยแล้ว`, type: 'success' });
          setMetaPatch(null);
        } else {
          throw new Error(data.error || 'Failed to approve patch');
        }
      } else {
        throw new Error('Network error during patch approval');
      }
    } catch (err: any) {
      setMessage({ text: `ไม่สามารถอนุมัติอัปเดตระบบ: ${err.message}`, type: 'error' });
    } finally {
      setSubmittingPatch(false);
    }
  }

  // Chatbot States
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOptions, setChatOptions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);

  // 📋 States for Management Recommendation Feedback & Evaluation
  const [membersList, setMembersList] = useState<any[]>([]);
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({
    targetType: 'team' as 'team' | 'individual',
    targetName: 'ภาพรวมทีม',
    targetUserId: '',
    recommendation: '',
    status: 'ลองแล้วได้ผลดี',
    rating: 5,
    comment: ''
  });
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const COLORS = ['#1A3A5C', '#2E75B6', '#F59E0B', '#10B981', '#8B5CF6'];

  const flagLabels: Record<string, string> = {
    '💎': 'Intense Creative (💎)',
    '⚗️': 'Hyper-Achiever (⚗️)',
    '🌱': 'Hidden Creative (🌱)',
    'Normal': 'ทั่วไป / ไม่มีธงพิเศษ',
    '': 'ทั่วไป / ไม่มีธงพิเศษ'
  };

  useEffect(() => {
    // Access Control
    const email = localStorage.getItem('kruth_admin_email');
    const role = localStorage.getItem('kruth_admin_role');

    if (!email || email !== 'whootthira@gmail.com' || role !== 'super_admin') {
      router.push('/admin');
      return;
    }

    // Load organizations first, then fetch initial dashboard data
    loadOrganizations().then(() => {
      fetchDashboardData('all');
      loadMetaPatch();
    });
  }, []);

  // Fetch new data when selected organization changes
  useEffect(() => {
    if (orgs.length > 0 || selectedOrgId !== 'all') {
      fetchDashboardData(selectedOrgId);
    }
  }, [selectedOrgId]);

  async function loadOrganizations() {
    try {
      const { data: dbOrgs } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      const { data: dbAdmins } = await supabase
        .from('org_admins')
        .select('*');

      const adminMap: Record<string, string> = {};
      (dbAdmins || []).forEach(adm => {
        if (adm.org_id) {
          adminMap[adm.org_id] = adm.email;
        }
      });

      const mappedOrgs = (dbOrgs || []).map((o: any) => ({
        ...o,
        admin_email: adminMap[o.id] || 'ยังไม่มีแอดมิน'
      }));
      setOrgs(mappedOrgs);
      setStats(prev => ({ ...prev, totalOrgs: dbOrgs?.length || 0 }));
    } catch (err) {
      console.error("Error loading organizations:", err);
    }
  }

  async function fetchDashboardData(orgId: string) {
    setLoading(true);
    try {
      let userIds: string[] | null = null;

      if (orgId !== 'all') {
        const { data: members } = await supabase
          .from('org_members')
          .select('user_id')
          .eq('org_id', orgId);

        userIds = (members || []).map(m => m.user_id);

        if (userIds.length === 0) {
          setStats(prev => ({ ...prev, totalUsers: 0 }));
          setKwiData([]);
          setQuadrantData([]);
          setClinicalStats({
            rain: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
            bolt: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
            fog: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
            socialanxiety: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
            ocd: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
            burnout: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
            adhd: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
            delusion: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
          });
          setBrightTypeData([]);
          setBrightFlagData([]);
          setEnergyData([]);
          setEnergyKeywordsData([]);
          setLoading(false);
          return;
        }
      }

      // 1. Fetch results count & basic data
      let resultsQuery = supabase.from('results').select('id, user_id, quadrant_primary, bright_flag, bright_type, energy_name, energy_keywords', { count: 'exact' });
      if (userIds) {
        resultsQuery = resultsQuery.in('user_id', userIds);
      }
      const { data: results, count: usersCount } = await resultsQuery;

      setStats(prev => ({ ...prev, totalUsers: usersCount || 0 }));

      // 2. Fetch KWI scores
      let kwiQuery = supabase.from('kwi_responses').select('vitality, meaning, connection, mastery, resilience');
      if (userIds) {
        kwiQuery = kwiQuery.in('user_id', userIds);
      }
      const { data: kwiResponses } = await kwiQuery;

      if (kwiResponses && kwiResponses.length > 0) {
        const sum = kwiResponses.reduce((acc, curr) => ({
          v: acc.v + (curr.vitality || 0),
          m: acc.m + (curr.meaning || 0),
          c: acc.c + (curr.connection || 0),
          a: acc.a + (curr.mastery || 0),
          r: acc.r + (curr.resilience || 0),
        }), { v: 0, m: 0, c: 0, a: 0, r: 0 });

        const len = kwiResponses.length;
        setKwiData([
          { name: 'พลังชีวิต', score: Math.round((sum.v / len) * 10) / 10 },
          { name: 'ความหมาย', score: Math.round((sum.m / len) * 10) / 10 },
          { name: 'สายสัมพันธ์', score: Math.round((sum.c / len) * 10) / 10 },
          { name: 'การเติบโต', score: Math.round((sum.a / len) * 10) / 10 },
          { name: 'ยืดหยุ่นลุกเร็ว', score: Math.round((sum.r / len) * 10) / 10 },
        ]);
      } else {
        setKwiData([]);
      }

      // 3. Quadrant distribution
      const quadCounts: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
      (results || []).forEach(r => {
        if (r.quadrant_primary && r.quadrant_primary in quadCounts) {
          quadCounts[r.quadrant_primary]++;
        }
      });

      const quadNames: Record<string, string> = {
        Q1: 'นักสำรวจ (Q1)',
        Q2: 'นักคิด (Q2)',
        Q3: 'ผู้ประสาน (Q3)',
        Q4: 'ผู้สร้างสรรค์ (Q4)'
      };

      setQuadrantData(
        Object.entries(quadCounts).map(([key, val]) => ({
          name: quadNames[key] || key,
          value: val
        }))
      );

      // 4. Fetch category_flags
      let flagsQuery = supabase.from('category_flags').select('user_id, rain_level, bolt_level, fog_level, bright_flag, bright_type, socialanxiety_level, ocd_level, burnout_level, adhd_level, delusion_level');
      if (userIds) {
        flagsQuery = flagsQuery.in('user_id', userIds);
      }
      const { data: flags } = await flagsQuery;

      const initCounts = () => ({ '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 });
      const clinCounts: Record<string, Record<string, number>> = {
        rain: initCounts(),
        bolt: initCounts(),
        fog: initCounts(),
        socialanxiety: initCounts(),
        ocd: initCounts(),
        burnout: initCounts(),
        adhd: initCounts(),
        delusion: initCounts(),
      };

      const mapLevelToEmoji = (lvl: string | null): '🟢' | '🟡' | '🟠' | '🔴' => {
        if (!lvl) return '🟢';
        const clean = lvl.trim();
        if (clean === '🔴') return '🔴';
        if (clean === '🟠') return '🟠';
        if (clean === '🟡') return '🟡';
        if (clean === '🟢') return '🟢';
        return '🟢';
      };

      const brightFlagCounts: Record<string, number> = { '💎': 0, '⚗️': 0, '🌱': 0, 'Normal': 0 };
      const typeCounts: Record<string, number> = {};

      (flags || []).forEach(f => {
        clinCounts.rain[mapLevelToEmoji(f.rain_level)]++;
        clinCounts.bolt[mapLevelToEmoji(f.bolt_level)]++;
        clinCounts.fog[mapLevelToEmoji(f.fog_level)]++;
        clinCounts.socialanxiety[mapLevelToEmoji(f.socialanxiety_level)]++;
        clinCounts.ocd[mapLevelToEmoji(f.ocd_level)]++;
        clinCounts.burnout[mapLevelToEmoji(f.burnout_level)]++;
        clinCounts.adhd[mapLevelToEmoji(f.adhd_level)]++;
        clinCounts.delusion[mapLevelToEmoji(f.delusion_level)]++;

        const flagKey = f.bright_flag ? f.bright_flag.trim() : 'Normal';
        if (flagKey in brightFlagCounts) {
          brightFlagCounts[flagKey]++;
        } else if (flagKey && flagKey !== '') {
          brightFlagCounts[flagKey] = (brightFlagCounts[flagKey] || 0) + 1;
        } else {
          brightFlagCounts['Normal']++;
        }

        if (f.bright_type) {
          const tName = f.bright_type.trim();
          if (tName) typeCounts[tName] = (typeCounts[tName] || 0) + 1;
        }
      });

      setClinicalStats(clinCounts);
      setBrightFlagData(Object.entries(brightFlagCounts).map(([name, value]) => ({ name, value })));
      setBrightTypeData(
        Object.entries(typeCounts)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
      );

      // 5. Energy Names & Keywords
      const energyNameCounts: Record<string, number> = {};
      const keywordCounts: Record<string, number> = {};

      (results || []).forEach(r => {
        if (r.energy_name) {
          const name = r.energy_name.trim();
          if (name) energyNameCounts[name] = (energyNameCounts[name] || 0) + 1;
        }
        if (r.energy_keywords) {
          const keywords = r.energy_keywords.split(/[,，\s]+/);
          keywords.forEach((kw: string) => {
            const clean = kw.trim();
            if (clean && clean.length > 1) {
              keywordCounts[clean] = (keywordCounts[clean] || 0) + 1;
            }
          });
        }
      });

      const sortedEnergy = Object.entries(energyNameCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      setEnergyData(sortedEnergy);

      const sortedKeywords = Object.entries(keywordCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 16);
      setEnergyKeywordsData(sortedKeywords);

      // 6. Fetch members details for selected organization (if not 'all')
      if (orgId !== 'all' && userIds && userIds.length > 0) {
        const { data: memberProfiles } = await supabase
          .from('results')
          .select(`
            user_id,
            archetype_id,
            quadrant_primary,
            archetypes(name_th),
            users:user_id(full_name)
          `)
          .in('user_id', userIds);

        setMembersList(memberProfiles || []);
      } else {
        setMembersList([]);
      }

      // 7. Fetch executive feedbacks
      await fetchFeedbacks(orgId);

    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }

  // Action: Add New Organization
  async function handleAddOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim() || !newOrgCode.trim()) return;
    
    setActionLoading(true);
    setMessage({ type: '', text: '' });
    
    try {
      const codeUpper = newOrgCode.trim().toUpperCase();
      const { error } = await supabase
        .from('organizations')
        .insert({
          name: newOrgName.trim(),
          org_code: codeUpper
        });

      if (error) throw error;

      setMessage({ type: 'success', text: `สร้างหน่วยงาน "${newOrgName}" สำเร็จ!` });
      setNewOrgName('');
      setNewOrgCode('');
      loadOrganizations();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'ไม่สามารถสร้างหน่วยงานได้ (รหัสซ้ำ?)' });
    } finally {
      setActionLoading(false);
    }
  }

  // Action: Assign Admin
  async function handleAssignAdmin(orgId: string) {
    const emailToAssign = assignEmail[orgId]?.trim().toLowerCase();
    if (!emailToAssign) return;

    setActionLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const { error } = await supabase
        .from('org_admins')
        .upsert({
          org_id: orgId,
          email: emailToAssign,
          role: 'org_admin'
        }, { onConflict: 'email' });

      if (error) throw error;

      setMessage({ type: 'success', text: `มอบสิทธิ์แอดมินอีเมล "${emailToAssign}" สำเร็จ!` });
      setAssignEmail(prev => ({ ...prev, [orgId]: '' }));
      loadOrganizations();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'เกิดข้อผิดพลาดในการบันทึกสิทธิ์' });
    } finally {
      setActionLoading(false);
    }
  }

  function handleImpersonate(orgId: string, orgName: string) {
    localStorage.setItem('kruth_admin_org_id', orgId);
    localStorage.setItem('kruth_admin_org_name', orgName);
    router.push('/admin/dashboard');
  }

  function handleLogout() {
    localStorage.clear();
    router.push('/admin');
  }

  const openChat = async () => {
    setShowChat(true);
    if (chatMessages.length === 0) {
      setChatLoading(true);
      try {
        const res = await fetch('/api/admin/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId: selectedOrgId === 'all' ? 'global' : selectedOrgId,
            message: 'สวัสดีค่ะ ช่วยสรุปภาพรวมสุขภาวะจิตใจเฉลี่ยขององค์กรที่เลือก และให้คำแนะนำหน่อยค่ะ',
            chatHistory: []
          })
        });
        const data = await res.json();
        if (data.ok) {
          setChatMessages([{ role: 'assistant', content: data.replyText }]);
          setChatOptions(data.options);
        }
      } catch (err) {
        console.error("Exec chatbot failed:", err);
      } finally {
        setChatLoading(false);
      }
    }
  };

  const sendChatMessage = async (text: string) => {
    if (!text.trim()) return;
    const newMsgs = [...chatMessages, { role: 'user' as const, content: text }];
    setChatMessages(newMsgs);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/admin/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: selectedOrgId === 'all' ? 'global' : selectedOrgId,
          message: text,
          chatHistory: newMsgs
        })
      });
      const data = await res.json();
      if (data.ok) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.replyText }]);
        setChatOptions(data.options);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setChatLoading(false);
    }
  };

  const fetchFeedbacks = async (orgId: string) => {
    try {
      let query = supabase
        .from('quick_assessments')
        .select('*')
        .eq('platform', 'executive_coach')
        .order('created_at', { ascending: false });

      if (orgId !== 'all') {
        query = query.eq('situation_type', orgId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching feedbacks:', error);
      } else {
        setFeedbacks(data || []);
      }
    } catch (err) {
      console.error('fetchFeedbacks error:', err);
    }
  };

  const handleSaveFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    const orgId = selectedOrgId === 'all' ? 'global' : selectedOrgId;

    setIsSubmittingFeedback(true);
    try {
      const { error } = await supabase
        .from('quick_assessments')
        .insert({
          platform: 'executive_coach',
          situation_type: orgId,
          target_role: feedbackForm.targetType,
          target_desc: feedbackForm.targetName,
          target_user_id: feedbackForm.targetType === 'individual' ? feedbackForm.targetUserId || null : null,
          q1_answer: feedbackForm.recommendation,
          q2_answer: feedbackForm.status,
          q3_answer: feedbackForm.comment,
          user_felt_compat: feedbackForm.rating
        });

      if (error) {
        alert('เกิดข้อผิดพลาดในการบันทึก: ' + error.message);
      } else {
        setFeedbackForm({
          targetType: 'team',
          targetName: 'ภาพรวมทีม',
          targetUserId: '',
          recommendation: '',
          status: 'ลองแล้วได้ผลดี',
          rating: 5,
          comment: ''
        });
        setShowFeedbackModal(false);
        await fetchFeedbacks(selectedOrgId);
      }
    } catch (err: any) {
      console.error('Error saving feedback:', err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handlePrefillFeedback = (recText: string) => {
    setFeedbackForm({
      targetType: 'team',
      targetName: 'ภาพรวมทีม',
      targetUserId: '',
      recommendation: recText,
      status: 'ลองแล้วได้ผลดี',
      rating: 5,
      comment: ''
    });
    setShowFeedbackModal(true);
  };

  // Stacked Bar Chart data formatting for clinical risks
  const clinicalChartData = [
    { name: 'ซึมเศร้า', '🟢 ปกติ': clinicalStats.rain['🟢'], '🟡 เฝ้าระวัง': clinicalStats.rain['🟡'], '🟠 เสี่ยงสูง': clinicalStats.rain['🟠'], '🔴 วิกฤต': clinicalStats.rain['🔴'] },
    { name: 'ก้าวร้าว', '🟢 ปกติ': clinicalStats.bolt['🟢'], '🟡 เฝ้าระวัง': clinicalStats.bolt['🟡'], '🟠 เสี่ยงสูง': clinicalStats.bolt['🟠'], '🔴 วิกฤต': clinicalStats.bolt['🔴'] },
    { name: 'ถดถอย', '🟢 ปกติ': clinicalStats.fog['🟢'], '🟡 เฝ้าระวัง': clinicalStats.fog['🟡'], '🟠 เสี่ยงสูง': clinicalStats.fog['🟠'], '🔴 วิกฤต': clinicalStats.fog['🔴'] },
    { name: 'กังวลสังคม', '🟢 ปกติ': clinicalStats.socialanxiety['🟢'], '🟡 เฝ้าระวัง': clinicalStats.socialanxiety['🟡'], '🟠 เสี่ยงสูง': clinicalStats.socialanxiety['🟠'], '🔴 วิกฤต': clinicalStats.socialanxiety['🔴'] },
    { name: 'ย้ำคิดย้ำทำ', '🟢 ปกติ': clinicalStats.ocd['🟢'], '🟡 เฝ้าระวัง': clinicalStats.ocd['🟡'], '🟠 เสี่ยงสูง': clinicalStats.ocd['🟠'], '🔴 วิกฤต': clinicalStats.ocd['🔴'] },
    { name: 'หมดไฟ', '🟢 ปกติ': clinicalStats.burnout['🟢'], '🟡 เฝ้าระวัง': clinicalStats.burnout['🟡'], '🟠 เสี่ยงสูง': clinicalStats.burnout['🟠'], '🔴 วิกฤต': clinicalStats.burnout['🔴'] },
    { name: 'สมาธิสั้น', '🟢 ปกติ': clinicalStats.adhd['🟢'], '🟡 เฝ้าระวัง': clinicalStats.adhd['🟡'], '🟠 เสี่ยงสูง': clinicalStats.adhd['🟠'], '🔴 วิกฤต': clinicalStats.adhd['🔴'] },
    { name: 'หลงผิด', '🟢 ปกติ': clinicalStats.delusion['🟢'], '🟡 เฝ้าระวัง': clinicalStats.delusion['🟡'], '🟠 เสี่ยงสูง': clinicalStats.delusion['🟠'], '🔴 วิกฤต': clinicalStats.delusion['🔴'] },
  ];

  // Map brightFlagData to display readable labels in BarChart
  const mappedBrightFlagData = brightFlagData.map(item => ({
    name: flagLabels[item.name] || item.name,
    value: item.value
  }));

  if (loading && orgs.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
        <span className="text-5xl animate-bounce mb-4">🦅</span>
        <h2 className="text-xl font-bold text-white animate-pulse">กำลังดึงข้อมูลภาพรวมระบบ...</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 text-slate-100 font-sans pb-16 animate-fade-in">
      
      {/* 👑 NAVBAR */}
      <nav className="bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-40 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🦅</span>
          <div>
            <h1 className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500">KRUTH MIND</h1>
            <p className="text-[0.65rem] text-slate-400 font-bold uppercase tracking-wider">Super Admin Global Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs bg-teal-500/10 text-teal-400 border border-teal-500/20 px-3 py-1 rounded-full font-bold">
            👑 Super Admin
          </span>
          <button onClick={handleLogout} className="text-xs bg-red-950/50 text-red-400 hover:bg-red-900 hover:text-white border border-red-800/40 px-3.5 py-1.5 rounded-xl transition-all font-bold">
            ออกจากระบบ
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        
        {/* Alerts */}
        {message.text && (
          <div className={`p-4 rounded-2xl text-xs md:text-sm font-bold border transition-all ${
            message.type === 'success' 
              ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300' 
              : 'bg-rose-950/40 border-rose-800/50 text-rose-300'
          }`}>
            {message.type === 'success' ? '✅' : '⚠️'} {message.text}
          </div>
        )}

        {/* 🤖 META-AI PATCH NOTIFICATION BOX (One-Click Patch Update) */}
        {metaPatch && (
          <div className="bg-gradient-to-br from-indigo-950/60 to-slate-900/60 border border-indigo-500/20 rounded-3xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-md">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/10 blur-3xl rounded-full" />
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-2 max-w-3xl">
                <span className="px-2.5 py-1 text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full uppercase tracking-wider block w-fit">
                  🤖 Meta-AI Layer Background Simulation (Offline Symbolic Regression)
                </span>
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <span>✨</span> ค้นพบโมเดลคำนวณที่แม่นยำกว่า: เวอร์ชัน {metaPatch.patchVersion}
                </h3>
                <p className="text-xs text-slate-350 leading-relaxed">
                  ระบบวิเคราะห์พฤติกรรมย้อนหลัง (Symbolic Regression) ตรวจจับโมเดลการประเมินค่าดัชนีประสานพลังทีม (Synergy Score) ที่สอดคล้องกับพฤติกรรมจริงมากกว่าสมการปัจจุบัน โดยประเมินจากการทดสอบข้ามสายมิติและประวัติการจัดกลุ่มที่ผ่านมา
                </p>

                {/* Formula Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 text-xs bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-500 font-bold block">สูตรคำนวณปัจจุบัน (Current Formula):</span>
                    <code className="text-slate-400 font-mono text-[10px] block bg-slate-900 p-2 rounded-lg border border-slate-800/50">{metaPatch.currentFormula}</code>
                    <span className="text-[10px] text-slate-400 block mt-1">
                      ความแม่นยำเฉลี่ย (Accuracy): <strong className="text-rose-400">{metaPatch.metrics.currentAccuracy}%</strong> (MSE: {metaPatch.metrics.currentMSE})
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-indigo-400 font-bold block">สูตรแนะนำใหม่ (Optimal Discovered Formula):</span>
                    <code className="text-indigo-300 font-mono text-[10px] block bg-indigo-950/30 p-2 rounded-lg border border-indigo-900/30">{metaPatch.optimalFormula}</code>
                    <span className="text-[10px] text-indigo-300 block mt-1">
                      ความแม่นยำเฉลี่ย (Accuracy): <strong className="text-emerald-400">{metaPatch.metrics.optimalAccuracy}%</strong> (MSE: {metaPatch.metrics.optimalMSE}) (เพิ่มขึ้น +{(metaPatch.metrics.optimalAccuracy - metaPatch.metrics.currentAccuracy).toFixed(1)}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="w-full md:w-auto flex flex-col items-center gap-2">
                <button
                  type="button"
                  disabled={submittingPatch}
                  onClick={handleApprovePatch}
                  className="w-full md:w-auto px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-extrabold rounded-2xl text-[11px] shadow-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <span>💾</span> {submittingPatch ? 'กำลังปรับปรุงสูตร...' : 'อนุมัติระบบ One-Click Patch Update'}
                </button>
                <span className="text-[9px] text-slate-500 text-center block">
                  * จะลงชื่อระบบ Audit Log เพื่อการสืบย้อนได้
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 🏢 FILTER CONTROLLER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40 border border-white/5 backdrop-blur-md rounded-2xl p-6 shadow-xl">
          <div>
            <h2 className="text-base font-black text-white">🔎 คัดกรองข้อมูลวิเคราะห์ระบบ</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">เลือกหน่วยงานย่อยเพื่อวิเคราะห์คะแนนและผลประเมินสุขภาวะเฉพาะสถาบัน</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">กรองตามหน่วยงาน:</span>
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="px-4 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-teal-500 min-w-[240px] shadow-lg cursor-pointer"
            >
              <option value="all">ทั้งหมด (ทุกหน่วยงาน)</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 📊 COUNTER CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="relative overflow-hidden rounded-2xl p-6 bg-slate-900/40 border border-white/5 backdrop-blur-md shadow-xl flex items-center gap-5">
            <span className="text-4xl bg-teal-500/10 text-teal-400 p-4 rounded-xl">👥</span>
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">ผู้ทำแบบประเมินรวม (ที่เลือก)</p>
              <h2 className="text-3xl font-black mt-1 text-white">
                {stats.totalUsers.toLocaleString()} <span className="text-lg font-medium text-slate-400">คน</span>
              </h2>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl p-6 bg-slate-900/40 border border-white/5 backdrop-blur-md shadow-xl flex items-center gap-5">
            <span className="text-4xl bg-blue-500/10 text-blue-400 p-4 rounded-xl">🏫</span>
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">หน่วยงาน/สถาบันในระบบ</p>
              <h2 className="text-3xl font-black mt-1 text-white">
                {stats.totalOrgs.toLocaleString()} <span className="text-lg font-medium text-slate-400">แห่ง</span>
              </h2>
            </div>
          </div>
        </div>

        {/* 🕸️ KWI & QUADRANT BAR CHARTS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Global KWI Scores */}
          <div className="lg:col-span-2 relative overflow-hidden rounded-2xl p-6 bg-slate-900/40 border border-white/5 backdrop-blur-md shadow-xl flex flex-col justify-between">
            <h3 className="font-bold text-sm text-slate-300 mb-6">📊 ค่าเฉลี่ยสุขภาวะ KWI (Overall KWI Score)</h3>
            <div className="w-full h-80">
              {kwiData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kwiData} margin={{ bottom: 20 }}>
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                    <YAxis domain={[0, 5]} stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} />
                    <Bar dataKey="score" radius={[8, 8, 0, 0]} fill="#2E75B6">
                      {kwiData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">ไม่มีข้อมูลสุขภาวะขณะนี้</div>
              )}
            </div>
          </div>

          {/* Quadrant Distribution Bar Chart */}
          <div className="relative overflow-hidden rounded-2xl p-6 bg-slate-900/40 border border-white/5 backdrop-blur-md shadow-xl flex flex-col justify-between">
            <h3 className="font-bold text-sm text-slate-300 mb-6">🧩 สัดส่วนขั้วพฤติกรรมหลัก (Quadrants Bar Chart)</h3>
            <div className="w-full h-80">
              {quadrantData.some(q => q.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={quadrantData} margin={{ bottom: 20 }}>
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {quadrantData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">ไม่มีข้อมูลบุคลิกภาพ</div>
              )}
            </div>
          </div>
        </div>

        {/* 🧠 CLINICAL SIGNALS SECTION */}
        <div className="space-y-6">
          <div>
            <h3 className="font-bold text-base text-slate-200">🧠 สัญญาณความเสี่ยงสุขภาวะจิตใจ (Clinical & Mental Health Signals)</h3>
            <p className="text-xs text-slate-400 mt-1">
              สรุปสัญญาณความเสี่ยงจิตวิทยาจาก category_flags แบบแผนภูมิแท่งเปรียบเทียบและรายละเอียดยอดคน
            </p>
          </div>

          {/* New Stacked Bar Chart for clinical indicators */}
          <div className="relative overflow-hidden rounded-2xl p-6 bg-slate-900/40 border border-white/5 backdrop-blur-md shadow-xl">
            <h3 className="font-bold text-sm text-slate-300 mb-6">📊 แผนภูมิแท่งเปรียบเทียบสัญญาณความเสี่ยงตามระดับความรุนแรง</h3>
            <div className="w-full h-96">
              {stats.totalUsers > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clinicalChartData} margin={{ bottom: 10, top: 10 }}>
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} />
                    <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                    <Bar dataKey="🟢 ปกติ" stackId="a" fill="#10B981" />
                    <Bar dataKey="🟡 เฝ้าระวัง" stackId="a" fill="#F59E0B" />
                    <Bar dataKey="🟠 เสี่ยงสูง" stackId="a" fill="#F97316" />
                    <Bar dataKey="🔴 วิกฤต" stackId="a" fill="#EF4444" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">ไม่มีข้อมูลสัญญาณเสี่ยงจิตวิทยาขณะนี้</div>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <LevelBar label="🌧️ ซึมเศร้า (Rain)" counts={clinicalStats.rain} total={stats.totalUsers} />
            <LevelBar label="⚡ ก้าวร้าว (Aggressive/Bolt)" counts={clinicalStats.bolt} total={stats.totalUsers} />
            <LevelBar label="🌫️ ถดถอย (Regression/Fog)" counts={clinicalStats.fog} total={stats.totalUsers} />
            <LevelBar label="👥 วิตกกังวลสังคม (Social Anxiety)" counts={clinicalStats.socialanxiety} total={stats.totalUsers} />
            <LevelBar label="⏳ ย้ำคิดย้ำทำ (OCD)" counts={clinicalStats.ocd} total={stats.totalUsers} />
            <LevelBar label="🔥 หมดไฟทำงาน (Burnout)" counts={clinicalStats.burnout} total={stats.totalUsers} />
            <LevelBar label="🎯 สมาธิสั้น (ADHD)" counts={clinicalStats.adhd} total={stats.totalUsers} />
            <LevelBar label="🌀 ความหลงผิด (Delusion)" counts={clinicalStats.delusion} total={stats.totalUsers} />
          </div>
        </div>

        {/* 💎 BRIGHT FLAGS & TYPES */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bright Flag Bar Chart */}
          <div className="relative overflow-hidden rounded-2xl p-6 bg-slate-900/40 border border-white/5 backdrop-blur-md shadow-xl flex flex-col justify-between">
            <h3 className="font-bold text-sm text-slate-300 mb-6">💎 สถิติธงสว่างไสวเด่น (Bright Flags Bar Chart)</h3>
            <div className="w-full h-80">
              {brightFlagData.some(f => f.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mappedBrightFlagData} margin={{ bottom: 20 }}>
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {mappedBrightFlagData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">ไม่มีข้อมูลธงสว่างไสว</div>
              )}
            </div>
          </div>

          {/* Bright Types list */}
          <div className="relative overflow-hidden rounded-2xl p-6 bg-slate-900/40 border border-white/5 backdrop-blur-md shadow-xl flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-300 mb-2">🧬 ประเภทสภาวะสว่างไสวหลัก (Bright Types)</h3>
              <p className="text-[11px] text-slate-400 mb-4">จำแนกประเภทความสร้างสรรค์เชิงบวกและความฉลาดทางจิตวิทยาส่วนบุคคล</p>
            </div>
            <div className="space-y-3">
              {brightTypeData.length > 0 ? (
                brightTypeData.map((item, index) => {
                  const maxVal = brightTypeData[0]?.value || 1;
                  const pctWidth = Math.round((item.value / maxVal) * 100);
                  return (
                    <div key={index} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-slate-200">{item.name}</span>
                        <span className="text-slate-400">{item.value} คน</span>
                      </div>
                      <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-teal-500 to-indigo-500 h-full rounded-full" style={{ width: `${pctWidth}%` }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-xs text-slate-500 text-center py-8">ไม่มีข้อมูลประเภทสภาวะสว่างไสว</div>
              )}
            </div>
          </div>
        </div>

        {/* 🔮 NUMEROLOGY ENERGY & KEYWORDS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Energy Names */}
          <div className="relative overflow-hidden rounded-2xl p-6 bg-slate-900/40 border border-white/5 backdrop-blur-md shadow-xl flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-300 mb-2">✨ พลังงานชีวิตหลักเด่น (Top Life Energies)</h3>
              <p className="text-[11px] text-slate-400 mb-4">สัดส่วนผู้ที่มีพลังเลขศาสตร์พลังงานชีวิตสูงสุด 5 อันดับแรก</p>
            </div>
            <div className="space-y-3">
              {energyData.length > 0 ? (
                energyData.map((item, index) => {
                  const maxVal = energyData[0]?.count || 1;
                  const pctWidth = Math.round((item.count / maxVal) * 100);
                  return (
                    <div key={index} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-slate-200">{item.name}</span>
                        <span className="text-slate-400">{item.count} คน</span>
                      </div>
                      <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-teal-500 to-blue-500 h-full rounded-full" style={{ width: `${pctWidth}%` }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-xs text-slate-500 text-center py-8">ไม่มีข้อมูลพลังงานชีวิต</div>
              )}
            </div>
          </div>

          {/* Keywords Cloud */}
          <div className="relative overflow-hidden rounded-2xl p-6 bg-slate-900/40 border border-white/5 backdrop-blur-md shadow-xl flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-300 mb-2">🏷️ คำสำคัญสะท้อนบุคลิกภาพยอดนิยม (Top Self-Keywords)</h3>
              <p className="text-[11px] text-slate-400 mb-4">คีย์เวิร์ดที่พบบ่อยในฐานข้อมูลพลังงานชีวิตของผู้ประเมิน</p>
            </div>
            <div className="flex flex-wrap gap-2.5 content-start justify-center py-4">
              {energyKeywordsData.length > 0 ? (
                energyKeywordsData.map((item, index) => {
                  const maxCount = energyKeywordsData[0]?.count || 1;
                  const ratio = item.count / maxCount;
                  const fontSize = ratio > 0.8 ? 'text-sm' : ratio > 0.5 ? 'text-xs' : 'text-[11px]';
                  const opacity = ratio > 0.8 ? 'opacity-100' : ratio > 0.5 ? 'opacity-85' : 'opacity-70';
                  const bgColors = [
                    'bg-teal-500/10 text-teal-300 border-teal-500/20',
                    'bg-blue-500/10 text-blue-300 border-blue-500/20',
                    'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
                    'bg-purple-500/10 text-purple-300 border-purple-500/20'
                  ];
                  const colorClass = bgColors[index % bgColors.length];
                  return (
                    <span
                      key={index}
                      className={`px-3 py-1.5 rounded-xl border font-bold transition-transform hover:scale-105 ${fontSize} ${opacity} ${colorClass}`}
                    >
                      {item.name} <span className="text-[9px] font-normal opacity-60">({item.count})</span>
                    </span>
                  );
                })
              ) : (
                <div className="text-xs text-slate-500 text-center py-8">ไม่มีข้อมูลคีย์เวิร์ด</div>
              )}
            </div>
          </div>
        </div>

        {/* 🏫 TENANT & ADMIN MANAGER */}
        <div className="relative overflow-hidden rounded-2xl p-6 bg-slate-900/40 border border-white/5 backdrop-blur-md shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="font-bold text-base text-slate-200">🏫 จัดการสิทธิ์แอดมินและหน่วยงาน</h3>
              <p className="text-xs text-slate-400 mt-1">เพิ่มหน่วยงานและมอบหมายสิทธิ์แอดมินสำหรับการตรวจสอบผลระดับสถาบัน</p>
            </div>
            {/* Create organization button */}
            <form onSubmit={handleAddOrg} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newOrgName}
                onChange={e => setNewOrgName(e.target.value)}
                placeholder="ชื่อหน่วยงานใหม่"
                className="px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs focus:outline-none focus:border-teal-500 text-white placeholder-slate-500"
                required
              />
              <input
                type="text"
                value={newOrgCode}
                onChange={e => setNewOrgCode(e.target.value)}
                placeholder="รหัสอ้างอิง (เช่น SQR_XYZ)"
                className="px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs focus:outline-none focus:border-teal-500 text-white placeholder-slate-500"
                required
              />
              <button
                type="submit"
                disabled={actionLoading}
                className="px-4 py-1.5 bg-gradient-to-r from-teal-500 to-blue-500 text-white font-bold rounded-xl text-xs hover:opacity-90 transition-all shadow-md"
              >
                เพิ่มหน่วยงาน
              </button>
            </form>
          </div>

          {/* List of Orgs Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider font-sans">
                  <th className="pb-3 pl-2">ชื่อหน่วยงาน</th>
                  <th className="pb-3">รหัสอ้างอิง</th>
                  <th className="pb-3">อีเมลแอดมินปัจจุบัน</th>
                  <th className="pb-3 text-center">มอบสิทธิ์แอดมิน</th>
                  <th className="pb-3 text-right pr-2">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {orgs.map(org => (
                  <tr key={org.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-4 pl-2 font-bold text-white">{org.name}</td>
                    <td className="py-4 font-mono text-[0.7rem] text-blue-400">{org.org_code}</td>
                    <td className="py-4">
                      <span className={`px-2.5 py-1 rounded-full font-semibold text-[0.7rem] ${
                        org.admin_email === 'ยังไม่มีแอดมิน'
                          ? 'bg-amber-950/40 text-amber-400 border border-amber-900/30'
                          : 'bg-teal-950/40 text-teal-400 border border-teal-900/30'
                      }`}>
                        {org.admin_email}
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-1 justify-center max-w-[240px] mx-auto">
                        <input
                          type="email"
                          placeholder="ระบุอีเมลใหม่"
                          value={assignEmail[org.id] || ''}
                          onChange={e => setAssignEmail(prev => ({ ...prev, [org.id]: e.target.value }))}
                          className="px-2.5 py-1 bg-slate-950/80 border border-slate-800 rounded-lg text-[0.7rem] focus:outline-none focus:border-teal-500 text-white placeholder-slate-600"
                        />
                        <button
                          onClick={() => handleAssignAdmin(org.id)}
                          disabled={actionLoading}
                          className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-[0.7rem] font-bold transition-all"
                        >
                          ยืนยัน
                        </button>
                      </div>
                    </td>
                    <td className="py-4 text-right pr-2">
                      <button
                        onClick={() => handleImpersonate(org.id, org.name)}
                        className="px-3.5 py-1.5 bg-blue-950/50 text-blue-400 border border-blue-900/30 hover:bg-blue-600 hover:text-white rounded-xl text-xs font-bold transition-all"
                      >
                        🔎 ดูแดชบอร์ด
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 📋 ระบบติดตามและประเมินผลคำแนะนำการบริหาร (Management Recommendation Feedbacks) */}
        <div className="relative overflow-hidden rounded-2xl p-6 bg-slate-900/40 border border-white/5 backdrop-blur-md shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="font-bold text-base text-slate-200">📋 ระบบบันทึกและติดตามประเมินผลการแนะนำในการบริหาร</h3>
              <p className="text-xs text-slate-400 mt-1">บันทึกผลการประเมินและการทดลองปรับใช้งานคำแนะนำในการบริหารองค์กร</p>
            </div>
            <button
              onClick={() => {
                setFeedbackForm({
                  targetType: 'team',
                  targetName: 'ภาพรวมทีม',
                  targetUserId: '',
                  recommendation: '',
                  status: 'ลองแล้วได้ผลดี',
                  rating: 5,
                  comment: ''
                });
                setShowFeedbackModal(true);
              }}
              className="bg-gradient-to-r from-teal-500 to-blue-500 text-white font-bold px-4 py-2 rounded-xl text-xs hover:opacity-90 transition-all shadow-md flex items-center gap-2 self-start sm:self-auto"
            >
              <span>➕</span> บันทึกการประเมินคำแนะนำใหม่
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider font-sans">
                  <th className="pb-3 pl-2">ประเภท</th>
                  <th className="pb-3">กลุ่ม/เป้าหมาย</th>
                  <th className="pb-3">คำแนะนำการบริหาร</th>
                  <th className="pb-3">ผลลัพธ์ / คะแนนประเมิน</th>
                  <th className="pb-3">ความคิดเห็นเพิ่มเติม</th>
                  <th className="pb-3 text-right pr-2">บันทึกเมื่อ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {feedbacks.map((fb) => (
                  <tr key={fb.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-4 pl-2 font-bold">
                      <span className={`px-2 py-1 rounded-md text-[0.7rem] font-bold ${
                        fb.target_role === 'individual'
                          ? 'bg-purple-955/40 text-purple-400 border border-purple-900/30'
                          : 'bg-blue-955/40 text-blue-400 border border-blue-900/30'
                      }`}>
                        {fb.target_role === 'individual' ? 'รายบุคคล' : 'รายทีม'}
                      </span>
                    </td>
                    <td className="py-4 font-bold text-slate-200">
                      {fb.target_desc}
                    </td>
                    <td className="py-4 text-[0.75rem] text-slate-400 max-w-xs truncate" title={fb.q1_answer}>
                      {fb.q1_answer}
                    </td>
                    <td className="py-4">
                      <div className="flex flex-col gap-1">
                        <span className={`px-2 py-0.5 rounded-full text-[0.65rem] font-bold inline-block text-center w-fit ${
                          fb.q2_answer === 'ลองแล้วได้ผลดี'
                            ? 'bg-emerald-955/40 text-emerald-450 border border-emerald-900/30'
                            : fb.q2_answer === 'กำลังดำเนินการ'
                            ? 'bg-amber-955/40 text-amber-450 border border-amber-900/30'
                            : fb.q2_answer === 'ไม่ได้ผล/ต้องการปรับปรุง'
                            ? 'bg-rose-955/40 text-rose-450 border border-rose-900/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {fb.q2_answer}
                        </span>
                        <div className="text-amber-500 text-xs">
                          {'★'.repeat(fb.user_felt_compat || 0)}
                          {'☆'.repeat(5 - (fb.user_felt_compat || 0))}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 text-[0.75rem] text-slate-400 max-w-xs truncate" title={fb.q3_answer}>
                      {fb.q3_answer || '-'}
                    </td>
                    <td className="py-4 text-right text-[0.7rem] text-slate-500 pr-2">
                      {new Date(fb.created_at).toLocaleString('th-TH')}
                    </td>
                  </tr>
                ))}
                {feedbacks.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      ยังไม่มีประวัติการบันทึกประเมินผลคำแนะนำในหน่วยงานที่เลือก คุณสามารถกด "ประเมินคำแนะนำนี้" ในบับเบิ้ลโค้ชด้านล่าง หรือปุ่มด้านบนเพื่อเพิ่มข้อมูลค่ะ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 📋 Modal: แบบฟอร์มประเมินคำแนะนำการบริหาร */}
        {showFeedbackModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-slate-900 rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-800 flex flex-col p-6 animate-fade-in text-left text-slate-100">
              <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
                <h3 className="text-lg font-bold text-teal-400 flex items-center gap-2">
                  <span>📝</span> บันทึกและประเมินผลคำแนะนำการบริหาร
                </h3>
                <button
                  type="button"
                  onClick={() => setShowFeedbackModal(false)}
                  className="text-slate-400 hover:text-white text-xl font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveFeedback} className="space-y-4">
                {/* Scope Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 font-sans">ขอบเขตคำแนะนำ (Scope)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFeedbackForm(prev => ({ ...prev, targetType: 'team', targetName: 'ภาพรวมทีม', targetUserId: '' }))}
                      className={`py-2 px-4 rounded-xl text-xs font-bold transition-all border ${
                        feedbackForm.targetType === 'team'
                          ? 'bg-teal-950/40 border-teal-500 text-teal-400'
                          : 'border-slate-800 text-slate-400 hover:bg-slate-850'
                      }`}
                    >
                      👥 รายทีม (Team)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const firstMember = membersList[0];
                        const firstMemberName = firstMember ? ((firstMember.users as any)?.full_name || `พนักงานรหัส ${firstMember.user_id.slice(0, 5)}`) : '';
                        setFeedbackForm(prev => ({
                          ...prev,
                          targetType: 'individual',
                          targetUserId: firstMember?.user_id || '',
                          targetName: firstMemberName
                        }));
                      }}
                      className={`py-2 px-4 rounded-xl text-xs font-bold transition-all border ${
                        feedbackForm.targetType === 'individual'
                          ? 'bg-purple-950/40 border-purple-500 text-purple-400'
                          : 'border-slate-800 text-slate-400 hover:bg-slate-850'
                      }`}
                    >
                      👤 รายบุคคล (Individual)
                    </button>
                  </div>
                </div>

                {/* Target Selector */}
                {feedbackForm.targetType === 'team' ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1.5">ระบุชื่อทีม / แผนก</label>
                    <input
                      type="text"
                      value={feedbackForm.targetName}
                      onChange={e => setFeedbackForm(prev => ({ ...prev, targetName: e.target.value }))}
                      placeholder="เช่น ภาพรวมทีม, ฝ่ายขาย, ทีมพัฒนา"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs focus:outline-none focus:border-teal-500 text-white placeholder-slate-650"
                      required
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1.5 font-sans font-semibold">เลือกพนักงานเป้าหมาย</label>
                    <select
                      value={feedbackForm.targetUserId}
                      onChange={e => {
                        const selectedUserId = e.target.value;
                        const member = membersList.find(m => m.user_id === selectedUserId);
                        const memberName = member ? ((member.users as any)?.full_name || `พนักงานรหัส ${member.user_id.slice(0, 5)}`) : '';
                        setFeedbackForm(prev => ({
                          ...prev,
                          targetUserId: selectedUserId,
                          targetName: memberName
                        }));
                      }}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-teal-500"
                      required
                    >
                      {membersList.length === 0 ? (
                        <option value="">{selectedOrgId === 'all' ? 'โปรดเลือกหน่วยงานด้านบนเพื่อเลือกพนักงาน' : 'ไม่มีข้อมูลพนักงานประเมินในหน่วยงานนี้'}</option>
                      ) : (
                        membersList.map(m => {
                          const name = (m.users as any)?.full_name || `พนักงานรหัส ${m.user_id.slice(0, 5)}`;
                          return (
                            <option key={m.user_id} value={m.user_id}>
                              {name} ({m.quadrant_primary || 'ไม่ระบุกรุ๊ป'})
                            </option>
                          );
                        })
                      )}
                    </select>
                  </div>
                )}

                {/* Recommendation Detail */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 font-sans font-semibold">คำแนะนำการบริหารที่ได้รับ</label>
                  <textarea
                    value={feedbackForm.recommendation}
                    onChange={e => setFeedbackForm(prev => ({ ...prev, recommendation: e.target.value }))}
                    placeholder="รายละเอียดคำแนะนำ หรือสิ่งที่ AI Coach ได้แนะนำ"
                    rows={4}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-650 focus:outline-none focus:border-teal-500 focus:ring-0 resize-y"
                    required
                  />
                </div>

                {/* Implementation Status */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 font-sans font-semibold">สถานะการทดลองปรับใช้งาน</label>
                  <select
                    value={feedbackForm.status}
                    onChange={e => setFeedbackForm(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="ลองแล้วได้ผลดี">🟢 ลองแล้วได้ผลดี (Tried & Effective)</option>
                    <option value="กำลังดำเนินการ">🟡 กำลังดำเนินการ (In Progress)</option>
                    <option value="ยังไม่ได้ลอง">⚪ ยังไม่ได้ลอง (Not Tried Yet)</option>
                    <option value="ไม่ได้ผล/ต้องการปรับปรุง">🔴 ไม่ได้ผล/ต้องการปรับปรุง (Ineffective)</option>
                  </select>
                </div>

                {/* Rating selection (Stars) */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 font-sans font-semibold">คะแนนผลลัพธ์ / ความพึงพอใจการบริหาร (Rating)</label>
                  <div className="flex gap-2 justify-start items-center">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setFeedbackForm(prev => ({ ...prev, rating: star }))}
                        className={`text-2xl transition-all ${
                          star <= feedbackForm.rating
                            ? 'text-amber-400 scale-110'
                            : 'text-slate-700 hover:text-amber-250'
                        }`}
                      >
                        ★
                      </button>
                    ))}
                    <span className="text-xs font-bold text-slate-500 ml-2">({feedbackForm.rating} / 5 คะแนน)</span>
                  </div>
                </div>

                {/* Comment details */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 font-sans font-semibold">ความคิดเห็น / ผลลัพธ์จากการนำไปใช้เพิ่มเติม (Outcome comment)</label>
                  <textarea
                    value={feedbackForm.comment}
                    onChange={e => setFeedbackForm(prev => ({ ...prev, comment: e.target.value }))}
                    placeholder="ระบุสิ่งที่สมาชิกสะท้อนกลับ หรืออุปสรรคข้อจำกัดที่พบ"
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-650 focus:outline-none focus:border-teal-500 focus:ring-0 resize-y"
                  />
                </div>

                {/* Submit / Cancel Actions */}
                <div className="flex justify-end gap-2 border-t border-slate-800 pt-4 mt-2">
                  <button
                    type="button"
                    onClick={() => setShowFeedbackModal(false)}
                    className="px-4 py-2 border border-slate-800 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-850 hover:text-white transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingFeedback || !feedbackForm.recommendation.trim()}
                    className="px-5 py-2 bg-gradient-to-r from-teal-500 to-blue-500 text-white rounded-xl text-xs font-bold transition-all hover:opacity-90 shadow-md"
                  >
                    {isSubmittingFeedback ? 'กำลังบันทึก...' : 'บันทึกคำประเมิน'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>

      {/* 🧘‍♀️ GLOBAL EXECUTIVE AI COACH CHATBOT WIDGET */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {showChat && (
          <div className="bg-[#0f172a]/95 border border-slate-800 shadow-2xl rounded-2xl w-[90vw] max-w-md h-[500px] flex flex-col mb-4 overflow-hidden text-left backdrop-blur-md animate-fade-in">
            {/* Header */}
            <div className="bg-gradient-to-r from-teal-500 to-blue-600 text-white p-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xl">💼</span>
                <div>
                  <h3 className="font-bold text-sm">Global AI Executive Coach</h3>
                  <p className="text-[0.65rem] text-teal-100">ผู้แนะนำและวิเคราะห์แผนกลยุทธ์จิตวิทยาระดับสูง</p>
                </div>
              </div>
              <button onClick={() => setShowChat(false)} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>

            {/* Chat History Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/30">
              {chatMessages.map((msg, index) => (
                <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl p-3.5 text-xs md:text-sm leading-relaxed text-slate-200 border ${
                    msg.role === 'user'
                      ? 'bg-blue-900/60 border-blue-700/50 rounded-tr-none'
                      : 'bg-slate-900/80 border-slate-800 rounded-tl-none'
                  }`}>
                    {msg.role !== 'user' && (
                      <div className="flex justify-between items-center mb-1 gap-2 border-b border-slate-800 pb-1">
                        <span className="font-bold text-[0.65rem] text-teal-400">Global AI Coach</span>
                        <button
                          type="button"
                          onClick={() => handlePrefillFeedback(msg.content)}
                          className="text-[0.55rem] bg-teal-950 hover:bg-teal-900 text-teal-400 px-1.5 py-0.5 rounded border border-teal-900/30 flex items-center gap-1 transition-colors font-semibold"
                        >
                          📝 ประเมินคำแนะนำนี้
                        </button>
                      </div>
                    )}
                    {msg.content.split('\n').map((line, idx) => (
                      <span key={idx} className="block mt-0.5">{line}</span>
                    ))}
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-900/80 text-slate-400 border border-slate-800 rounded-2xl p-3 text-xs flex items-center gap-2">
                    <span className="animate-pulse">● ● ●</span> บอทกำลังประมวลสรุปข้อมูล...
                  </div>
                </div>
              )}
            </div>

            {/* Suggestions */}
            {showSuggestions && chatOptions.length > 0 && !chatLoading && (
              <div className="px-4 py-2 bg-slate-900/80 border-t border-slate-800 flex flex-wrap gap-2 overflow-x-auto relative">
                <div className="w-full flex justify-between items-center mb-1 text-[10px] text-slate-400 font-semibold">
                  <span>💡 คำถามแนะนำ</span>
                  <button 
                    type="button" 
                    onClick={() => setShowSuggestions(false)}
                    className="hover:text-red-400 transition-colors"
                  >
                    ซ่อน ✕
                  </button>
                </div>
                {chatOptions.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => sendChatMessage(opt)}
                    className="text-xs bg-teal-950/40 hover:bg-teal-900/40 border border-teal-900/30 text-teal-400 px-3 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* Indicator to show suggestions when hidden */}
            {!showSuggestions && chatOptions.length > 0 && !chatLoading && (
              <div className="px-4 py-1 bg-slate-900/80 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowSuggestions(true)}
                  className="text-[10px] text-teal-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  💡 แสดงคำถามแนะนำ
                </button>
              </div>
            )}

            {/* Form Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendChatMessage(chatInput);
              }}
              className="p-3 bg-slate-900/80 border-t border-slate-850 flex gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                disabled={chatLoading}
                placeholder="ปรึกษาวิเคราะห์สภาวะจิตใจ..."
                className="flex-1 px-3.5 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs md:text-sm focus:outline-none focus:border-teal-500 disabled:bg-slate-950/40 text-white placeholder-slate-600"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="px-4 py-2 bg-gradient-to-r from-teal-500 to-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-md"
              >
                ส่ง
              </button>
            </form>
          </div>
        )}

        {/* Floating Bubble Button */}
        <button
          onClick={openChat}
          className="flex items-center gap-2 px-5 py-3 rounded-full bg-gradient-to-r from-teal-500 to-blue-600 text-white shadow-xl hover:scale-105 transition-transform font-bold text-xs md:text-sm"
        >
          <span className="text-base">💼</span> ปรึกษา Global AI Coach
        </button>
      </div>

    </div>
  );
}
