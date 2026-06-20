'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
// นำเข้าแพ็กเกจสำหรับวาดกราฟ
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface LevelBarProps {
  label: string;
  counts: Record<string, number>;
  total: number;
}

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
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-left flex flex-col md:flex-row md:items-center justify-between gap-4">
      {/* Label and Total */}
      <div className="flex flex-row md:flex-col md:items-start justify-between items-center w-full md:w-1/4 lg:w-1/5 shrink-0 border-b md:border-b-0 md:border-r border-gray-100 pb-2 md:pb-0 md:pr-4">
        <span className="text-sm font-bold text-gray-800">{label}</span>
        <span className="text-[10px] text-gray-400 md:mt-1">ผู้ประเมิน {total} คน</span>
      </div>

      {/* Stacked bar */}
      <div className="flex-1 w-full flex flex-col justify-center px-1">
        <div className="h-3.5 w-full bg-gray-50 rounded-full overflow-hidden flex shadow-inner">
          {pctG > 0 && <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${pctG}%` }} title={`ปกติ/เสี่ยงต่ำ: ${pctG}%`} />}
          {pctY > 0 && <div className="bg-amber-400 h-full transition-all duration-500" style={{ width: `${pctY}%` }} title={`เฝ้าระวัง: ${pctY}%`} />}
          {pctO > 0 && <div className="bg-orange-500 h-full transition-all duration-500" style={{ width: `${pctO}%` }} title={`เสี่ยงสูง: ${pctO}%`} />}
          {pctR > 0 && <div className="bg-rose-600 h-full transition-all duration-500" style={{ width: `${pctR}%` }} title={`เสี่ยงวิกฤต: ${pctR}%`} />}
        </div>
      </div>

      {/* Legend with counts & percentages */}
      <div className="w-full md:w-2/5 lg:w-1/3 shrink-0 grid grid-cols-4 gap-1 text-[11px] font-bold text-gray-500 md:pl-4">
        <div className="flex flex-col items-center border-r border-gray-100">
          <span className="text-emerald-600 text-xs">🟢 ปกติ</span>
          <span className="mt-0.5 text-gray-700">{green} <span className="text-[10px] font-normal text-gray-400">({pctG}%)</span></span>
        </div>
        <div className="flex flex-col items-center border-r border-gray-100">
          <span className="text-amber-500 text-xs">🟡 ระวัง</span>
          <span className="mt-0.5 text-gray-700">{yellow} <span className="text-[10px] font-normal text-gray-400">({pctY}%)</span></span>
        </div>
        <div className="flex flex-col items-center border-r border-gray-100">
          <span className="text-orange-500 text-xs">🟠 เสี่ยง</span>
          <span className="mt-0.5 text-gray-700">{orange} <span className="text-[10px] font-normal text-gray-400">({pctO}%)</span></span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-rose-600 text-xs">🔴 วิกฤต</span>
          <span className="mt-0.5 text-gray-700">{red} <span className="text-[10px] font-normal text-gray-400">({pctR}%)</span></span>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState('สกร. ระดับอำเภอด่านขุนทด');
  const [stats, setStats] = useState({ total: 0, today: 0 });
  const [quadrantData, setQuadrantData] = useState<any[]>([]);
  const [topArchetypes, setTopArchetypes] = useState<any[]>([]);
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  
  const [slowestQuestions, setSlowestQuestions] = useState<any[]>([]);
  const [fastestQuestions, setFastestQuestions] = useState<any[]>([]);

  // 🧘‍♀️ Executive AI Coach chatbot state
  const [showExecChat, setShowExecChat] = useState(false);
  const [execMessages, setExecMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [execInput, setExecInput] = useState('');
  const [execLoading, setExecLoading] = useState(false);
  const [execOptions, setExecOptions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // 🧠 Wellness & Risk States
  const [kwiData, setKwiData] = useState<any[]>([]);
  const [clinicalStats, setClinicalStats] = useState<any>({
    rain: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
    bolt: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
    fog: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
    socialanxiety: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
    ocd: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
    burnout: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
    adhd: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
    delusion: { '🟢': 0, '🟡': 0, '🟠': 0, '🔴': 0 },
  });

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

  // โทนสีของ KRUTH DEMM สำหรับกราฟ
  const COLORS = ['#1A3A5C', '#2E75B6', '#F59E0B', '#10B981', '#8B5CF6'];

  useEffect(() => {
    // Access Control check
    const email = localStorage.getItem('kruth_admin_email');
    const orgId = localStorage.getItem('kruth_admin_org_id');
    const storedOrgName = localStorage.getItem('kruth_admin_org_name');
    const role = localStorage.getItem('kruth_admin_role');

    // Allow both regular org_admin and super_admin (who impersonates an orgId)
    if (!email || !orgId || (role !== 'org_admin' && role !== 'super_admin')) {
      router.push('/admin');
      return;
    }

    setIsSuperAdmin(role === 'super_admin');

    if (storedOrgName) {
      setOrgName(storedOrgName);
    }

    fetchDashboardData(orgId);
  }, []);

  const openExecChat = async () => {
    setShowExecChat(true);
    if (execMessages.length === 0) {
      setExecLoading(true);
      const orgId = localStorage.getItem('kruth_admin_org_id');
      try {
        const res = await fetch('/api/admin/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            message: 'สวัสดีค่ะ ช่วยแนะนำตัววิเคราะห์สุขภาวะโดยรวมและให้ข้อเสนอแนะในการบริหารขององค์กรเราหน่อยค่ะ',
            chatHistory: []
          })
        });
        const data = await res.json();
        if (data.ok) {
          setExecMessages([
            { role: 'assistant', content: data.replyText }
          ]);
          setExecOptions(data.options);
        }
      } catch (err) {
        console.error("Failed to load exec chat greeting:", err);
      } finally {
        setExecLoading(false);
      }
    }
  };

  const sendExecMessage = async (msgText: string) => {
    if (!msgText.trim()) return;
    const orgId = localStorage.getItem('kruth_admin_org_id');
    const newMessages = [...execMessages, { role: 'user' as const, content: msgText }];
    setExecMessages(newMessages);
    setExecInput('');
    setExecLoading(true);

    try {
      const res = await fetch('/api/admin/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          message: msgText,
          chatHistory: newMessages,
        })
      });
      const data = await res.json();
      if (data.ok) {
        setExecMessages(prev => [...prev, { role: 'assistant', content: data.replyText }]);
        setExecOptions(data.options);
      }
    } catch (err) {
      console.error("Failed to send exec message:", err);
    } finally {
      setExecLoading(false);
    }
  };

  const fetchFeedbacks = async (orgId: string) => {
    try {
      const { data, error } = await supabase
        .from('quick_assessments')
        .select('*')
        .eq('platform', 'executive_coach')
        .eq('situation_type', orgId)
        .order('created_at', { ascending: false });

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
    const orgId = localStorage.getItem('kruth_admin_org_id');
    if (!orgId) return;

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
        await fetchFeedbacks(orgId);
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

  async function fetchDashboardData(passedOrgId?: string) {
    setLoading(true);
    const orgId = passedOrgId || localStorage.getItem('kruth_admin_org_id');
    if (!orgId) {
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch user ids from org_members for this organization
      const { data: members } = await supabase
        .from('org_members')
        .select('user_id')
        .eq('org_id', orgId);

      const userIds = (members || []).map(m => m.user_id);

      if (userIds.length === 0) {
        setStats({ total: 0, today: 0 });
        setQuadrantData([]);
        setTopArchetypes([]);
        setRecentUsers([]);
        setSlowestQuestions([]);
        setFastestQuestions([]);
        setLoading(false);
        return;
      }

      // 2. Fetch Results for these users
      const { data: results, error } = await supabase
        .from('results')
        .select(`
          id, 
          created_at, 
          quadrant_primary,
          archetype_id,
          session_id,
          archetypes ( name_th )
        `)
        .in('user_id', userIds)
        .order('created_at', { ascending: false });

      if (error || !results) {
        console.error('Error fetching data:', error);
        setLoading(false);
        return;
      }

      // 3. Calculate general KPIs
      const total = results.length;
      const today = results.filter(r => new Date(r.created_at).toDateString() === new Date().toDateString()).length;
      setStats({ total, today });

      // 4. Donut chart data (Quadrant Distribution)
      const quadCount: Record<string, number> = {};
      results.forEach(r => {
        const q = r.quadrant_primary || 'ไม่ระบุ';
        quadCount[q] = (quadCount[q] || 0) + 1;
      });
      
      const quadrantThaiNames: Record<string, string> = {
        'Q1': 'นักสำรวจ (Q1)',
        'Q2': 'นักคิด (Q2)',
        'Q3': 'ผู้ประสาน (Q3)',
        'Q4': 'ผู้สร้างสรรค์ (Q4)'
      };

      const parsedQuadrantData = Object.keys(quadCount).map(key => ({
        name: quadrantThaiNames[key] || key,
        value: quadCount[key]
      })).sort((a, b) => b.value - a.value);
      setQuadrantData(parsedQuadrantData);

      // 5. Bar chart data (Top Archetypes)
      const archCount: Record<string, number> = {};
      results.forEach(r => {
        const archName = (r.archetypes as any)?.name_th || r.archetype_id;
        archCount[archName] = (archCount[archName] || 0) + 1;
      });
      const parsedTopArch = Object.keys(archCount)
        .map(key => ({ name: key, count: archCount[key] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      setTopArchetypes(parsedTopArch);

      // 6. Recent 10 users for table
      setRecentUsers(results.slice(0, 10));

      // 7. Fetch item analytics filtered by session_ids
      const sessionIds = results.map(r => r.session_id).filter(Boolean);
      if (sessionIds.length > 0) {
        const { data: analytics } = await supabase
          .from('quiz_analytics')
          .select('question_id, time_spent_ms')
          .in('session_id', sessionIds);
        
        if (analytics && analytics.length > 0) {
          const qStats: Record<string, { totalTime: number; count: number }> = {};
          analytics.forEach(row => {
            if (!row.question_id) return;
            if (!qStats[row.question_id]) qStats[row.question_id] = { totalTime: 0, count: 0 };
            qStats[row.question_id].totalTime += row.time_spent_ms;
            qStats[row.question_id].count += 1;
          });

          const qAverages = Object.keys(qStats).map(qId => ({
            id: qId,
            avgSec: (qStats[qId].totalTime / qStats[qId].count) / 1000,
            count: qStats[qId].count
          })).filter(q => q.count > 0);

          setSlowestQuestions([...qAverages].sort((a, b) => b.avgSec - a.avgSec).slice(0, 5));
          setFastestQuestions([...qAverages].sort((a, b) => a.avgSec - b.avgSec).slice(0, 5));
        }
      }

      // 7.2 Fetch KWI responses
      const { data: kwiResponses } = await supabase
        .from('kwi_responses')
        .select('vitality, meaning, connection, mastery, resilience')
        .in('user_id', userIds);

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

      // 7.5 Fetch category_flags
      const { data: flags } = await supabase
        .from('category_flags')
        .select('user_id, rain_level, bolt_level, fog_level, bright_flag, bright_type, socialanxiety_level, ocd_level, burnout_level, adhd_level, delusion_level')
        .in('user_id', userIds);

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

      (flags || []).forEach(f => {
        clinCounts.rain[mapLevelToEmoji(f.rain_level)]++;
        clinCounts.bolt[mapLevelToEmoji(f.bolt_level)]++;
        clinCounts.fog[mapLevelToEmoji(f.fog_level)]++;
        clinCounts.socialanxiety[mapLevelToEmoji(f.socialanxiety_level)]++;
        clinCounts.ocd[mapLevelToEmoji(f.ocd_level)]++;
        clinCounts.burnout[mapLevelToEmoji(f.burnout_level)]++;
        clinCounts.adhd[mapLevelToEmoji(f.adhd_level)]++;
        clinCounts.delusion[mapLevelToEmoji(f.delusion_level)]++;
      });

      setClinicalStats(clinCounts);

      // 8. Fetch individual member profiles for team building and coaching dropdown
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

      // 9. Fetch executive feedbacks
      await fetchFeedbacks(orgId);

    } catch (err) {
      console.error('fetchDashboardData Error:', err);
    } finally {
      setLoading(false);
    }
  }


  // หน้าจอตอนกำลังโหลดข้อมูล
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] flex flex-col items-center justify-center p-4">
        <div className="text-6xl animate-bounce mb-4">🦅</div>
        <h2 className="text-xl font-bold text-[#1A3A5C] animate-pulse">กำลังดึงข้อมูล Dashboard...</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 font-sans text-gray-800">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-[#1A3A5C] rounded-2xl p-6 text-white shadow-lg">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-1 flex items-center gap-2">
              <span>📊</span> KRUTH DEMM Dashboard — {orgName}
            </h1>
            <p className="text-sm text-blue-200">สรุปข้อมูลผู้ใช้งานระบบประเมินบุคลิกภาพ</p>
          </div>
          <div className="flex gap-2 mt-4 md:mt-0">
            {isSuperAdmin && (
              <button 
                onClick={() => router.push('/admin/super-dashboard')} 
                className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all"
              >
                ⬅️ กลับหน้า Super Admin
              </button>
            )}
            <button onClick={() => fetchDashboardData()} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm font-bold transition-colors">
              🔄 รีเฟรชข้อมูล
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center items-center text-center">
            <p className="text-sm text-gray-500 font-bold mb-1">ยอดผู้ทำแบบทดสอบรวม</p>
            <p className="text-4xl md:text-5xl font-black text-[#1A3A5C]">{stats.total}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center items-center text-center">
            <p className="text-sm text-gray-500 font-bold mb-1">ผู้ทำแบบทดสอบวันนี้</p>
            <p className="text-4xl md:text-5xl font-black text-emerald-600">+{stats.today}</p>
          </div>
          <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-6 rounded-2xl shadow-sm text-white flex flex-col justify-center items-center text-center col-span-2 md:col-span-2">
            <p className="text-sm font-bold mb-1 opacity-90">กลุ่มผู้ใช้หลัก (Majority Quadrant)</p>
            <p className="text-3xl font-black">{quadrantData[0]?.name || 'ไม่มีข้อมูล'}</p>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Pie Chart: Quadrant */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-96 flex flex-col">
            <h3 className="font-bold text-[#1A3A5C] mb-4 text-lg border-b pb-2">🎯 สัดส่วนกลุ่มผู้ใช้ (Quadrant)</h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={quadrantData} cx="50%" cy="50%" outerRadius={90} innerRadius={50} dataKey="value" label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                    {quadrantData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} คน`, 'จำนวน']} />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bar Chart: Top Archetypes */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-96 flex flex-col">
            <h3 className="font-bold text-[#1A3A5C] mb-4 text-lg border-b pb-2">🏆 Top 5 บุคลิกภาพที่พบมากที่สุด</h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topArchetypes} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: '#4B5563', fontWeight: 600 }} />
                  <Tooltip cursor={{fill: '#F3F4F6'}} formatter={(value) => [`${value} คน`, 'จำนวน']} />
                  <Bar dataKey="count" fill="#2E75B6" radius={[0, 6, 6, 0]} barSize={30}>
                    {topArchetypes.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 🧘‍♂️ มิติสุขภาวะ KWI & สัญญาณความเสี่ยงจิตวิทยา */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
          <div className="border-b pb-4">
            <h3 className="font-bold text-[#1A3A5C] text-lg">📊 ดัชนีสุขภาวะและสัญญาณระวังภัย (Wellbeing & Risk Indicators)</h3>
            <p className="text-xs text-gray-500">ข้อมูลวิเคราะห์ระดับสุขภาวะ KWI และระดับความเสี่ยงของสมาชิกในหน่วยงาน</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* KWI Averages Chart */}
            <div className="lg:col-span-2 border border-gray-100 rounded-2xl p-4 flex flex-col justify-between">
              <h4 className="font-bold text-sm text-[#1A3A5C] mb-4">📈 ค่าเฉลี่ยสุขภาวะ KWI (KWI Dimensions)</h4>
              <div className="w-full h-72">
                {kwiData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={kwiData} margin={{ bottom: 20 }}>
                      <XAxis dataKey="name" stroke="#6b7280" fontSize={10} tickLine={false} />
                      <YAxis domain={[0, 5]} stroke="#6b7280" fontSize={11} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '12px' }} />
                      <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                        {kwiData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-gray-400">ยังไม่มีข้อมูลสุขภาวะหน่วยงานนี้</div>
                )}
              </div>
            </div>

            {/* Stacked Risk Chart */}
            <div className="border border-gray-100 rounded-2xl p-4 flex flex-col justify-between">
              <h4 className="font-bold text-sm text-[#1A3A5C] mb-4">⚠️ สรุปความรุนแรงของสัญญาณเสี่ยง</h4>
              <div className="w-full h-72">
                {stats.total > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: 'ซึมเศร้า', '🟢 ปกติ': clinicalStats.rain['🟢'], '🟡 เฝ้าระวัง': clinicalStats.rain['🟡'], '🟠 เสี่ยงสูง': clinicalStats.rain['🟠'], '🔴 วิกฤต': clinicalStats.rain['🔴'] },
                      { name: 'ก้าวร้าว', '🟢 ปกติ': clinicalStats.bolt['🟢'], '🟡 เฝ้าระวัง': clinicalStats.bolt['🟡'], '🟠 เสี่ยงสูง': clinicalStats.bolt['🟠'], '🔴 วิกฤต': clinicalStats.bolt['🔴'] },
                      { name: 'ถดถอย', '🟢 ปกติ': clinicalStats.fog['🟢'], '🟡 เฝ้าระวัง': clinicalStats.fog['🟡'], '🟠 เสี่ยงสูง': clinicalStats.fog['🟠'], '🔴 วิกฤต': clinicalStats.fog['🔴'] },
                      { name: 'หมดไฟ', '🟢 ปกติ': clinicalStats.burnout['🟢'], '🟡 เฝ้าระวัง': clinicalStats.burnout['🟡'], '🟠 เสี่ยงสูง': clinicalStats.burnout['🟠'], '🔴 วิกฤต': clinicalStats.burnout['🔴'] }
                    ]} margin={{ bottom: 10, top: 10 }}>
                      <XAxis dataKey="name" stroke="#6b7280" fontSize={9} tickLine={false} />
                      <YAxis stroke="#6b7280" fontSize={10} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '12px' }} />
                      <Bar dataKey="🟢 ปกติ" stackId="a" fill="#10B981" />
                      <Bar dataKey="🟡 เฝ้าระวัง" stackId="a" fill="#F59E0B" />
                      <Bar dataKey="🟠 เสี่ยงสูง" stackId="a" fill="#F97316" />
                      <Bar dataKey="🔴 วิกฤต" stackId="a" fill="#EF4444" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-gray-400">ยังไม่มีข้อมูลสัญญาณความเสี่ยง</div>
                )}
              </div>
            </div>
          </div>

          {/* Level Bars detailed grid */}
          <div className="grid grid-cols-1 gap-4 pt-2">
            <LevelBar label="🌧️ ซึมเศร้า (Rain)" counts={clinicalStats.rain} total={stats.total} />
            <LevelBar label="⚡ ก้าวร้าว (Bolt)" counts={clinicalStats.bolt} total={stats.total} />
            <LevelBar label="🌫️ ถดถอย (Fog)" counts={clinicalStats.fog} total={stats.total} />
            <LevelBar label="👥 วิตกกังวลสังคม (Social Anxiety)" counts={clinicalStats.socialanxiety} total={stats.total} />
            <LevelBar label="⏳ ย้ำคิดย้ำทำ (OCD)" counts={clinicalStats.ocd} total={stats.total} />
            <LevelBar label="🔥 หมดไฟทำงาน (Burnout)" counts={clinicalStats.burnout} total={stats.total} />
            <LevelBar label="🎯 สมาธิสั้น (ADHD)" counts={clinicalStats.adhd} total={stats.total} />
            <LevelBar label="🌀 ความหลงผิด (Delusion)" counts={clinicalStats.delusion} total={stats.total} />
          </div>
        </div>


        {/* 🚨 ใหม่: Item Analysis Section (ข้อที่คิดนาน vs ตอบเร็ว) */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Slowest Questions */}
          <div className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
            <div className="p-4 border-b border-orange-100 bg-orange-50/50 flex justify-between items-center">
              <h3 className="font-bold text-orange-800">🐢 5 ข้อที่ใช้เวลาคิดนานที่สุด</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[0.65rem] text-gray-500 uppercase bg-gray-50 border-b">
                  <tr><th className="px-4 py-3">รหัสคำถาม</th><th className="px-4 py-3 text-right">เวลาเฉลี่ย</th><th className="px-4 py-3 text-right">จำนวนคนตอบ</th></tr>
                </thead>
                <tbody>
                  {slowestQuestions.map((q, i) => (
                    <tr key={i} className="border-b hover:bg-orange-50/30 transition-colors">
                      <td className="px-4 py-3 font-bold text-gray-700">{q.id}</td>
                      <td className="px-4 py-3 text-right font-bold text-orange-600">{q.avgSec.toFixed(1)} วิ</td>
                      <td className="px-4 py-3 text-right text-gray-400">{q.count}</td>
                    </tr>
                  ))}
                  {slowestQuestions.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">รอเก็บข้อมูลสักพัก...</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Fastest Questions */}
          <div className="bg-white rounded-2xl shadow-sm border border-blue-100 overflow-hidden">
            <div className="p-4 border-b border-blue-100 bg-blue-50/50 flex justify-between items-center">
              <h3 className="font-bold text-[#1A3A5C]">⚡ 5 ข้อที่ถูกกดตอบเร็วที่สุด</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[0.65rem] text-gray-500 uppercase bg-gray-50 border-b">
                  <tr><th className="px-4 py-3">รหัสคำถาม</th><th className="px-4 py-3 text-right">เวลาเฉลี่ย</th><th className="px-4 py-3 text-right">จำนวนคนตอบ</th></tr>
                </thead>
                <tbody>
                  {fastestQuestions.map((q, i) => (
                    <tr key={i} className="border-b hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3 font-bold text-gray-700">{q.id}</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-600">{q.avgSec.toFixed(1)} วิ</td>
                      <td className="px-4 py-3 text-right text-gray-400">{q.count}</td>
                    </tr>
                  ))}
                  {fastestQuestions.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">รอเก็บข้อมูลสักพัก...</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Recent Data Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-[#1A3A5C] text-lg">📋 ประวัติการทำแบบทดสอบ 10 คนล่าสุด</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-white border-b">
                <tr>
                  <th className="px-6 py-4">ID อ้างอิง (DVJ)</th>
                  <th className="px-6 py-4">บุคลิกภาพ (Archetype)</th>
                  <th className="px-6 py-4">กลุ่ม (Quadrant)</th>
                  <th className="px-6 py-4">วันที่ทำแบบทดสอบ</th>
                </tr>
              </thead>
              <tbody>
                {recentUsers.map(user => (
                  <tr key={user.id} className="bg-white border-b hover:bg-blue-50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-gray-400">
                      <span className="bg-gray-100 px-2 py-1 rounded-md">{user.id.substring(0,8)}</span>
                    </td>
                    <td className="px-6 py-4 font-bold text-[#1A3A5C]">
                      {(user.archetypes as any)?.name_th || user.archetype_id}
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-blue-100 text-blue-800 text-[0.65rem] md:text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                        {user.quadrant_primary}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(user.created_at).toLocaleString('th-TH')}
                    </td>
                  </tr>
                ))}
                {recentUsers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">ยังไม่มีข้อมูลผู้ทำแบบทดสอบ</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 📋 ระบบติดตามและประเมินผลคำแนะนำการบริหาร (Management Recommendation Feedbacks) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div>
              <h3 className="font-bold text-[#1A3A5C] text-lg">📋 ระบบบันทึกและติดตามประเมินผลการแนะนำในการบริหาร</h3>
              <p className="text-xs text-gray-500">บันทึกผลการประเมินและการทดลองปรับใช้งานคำแนะนำในการบริหารองค์กร</p>
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
              className="bg-[#1A3A5C] hover:bg-[#2E75B6] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 self-start sm:self-auto"
            >
              <span>➕</span> บันทึกการประเมินคำแนะนำใหม่
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-white border-b">
                <tr>
                  <th className="px-6 py-4">ประเภท</th>
                  <th className="px-6 py-4">กลุ่ม/เป้าหมาย</th>
                  <th className="px-6 py-4">คำแนะนำการบริหาร</th>
                  <th className="px-6 py-4">ผลลัพธ์ / คะแนนประเมิน</th>
                  <th className="px-6 py-4">ความคิดเห็นเพิ่มเติม</th>
                  <th className="px-6 py-4">บันทึกเมื่อ</th>
                </tr>
              </thead>
              <tbody>
                {feedbacks.map((fb) => (
                  <tr key={fb.id} className="bg-white border-b hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-bold">
                      <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                        fb.target_role === 'individual'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {fb.target_role === 'individual' ? 'รายบุคคล' : 'รายทีม'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-700">
                      {fb.target_desc}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-600 max-w-xs truncate" title={fb.q1_answer}>
                      {fb.q1_answer}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={`px-2 py-0.5 rounded-full text-[0.7rem] font-bold inline-block text-center w-fit ${
                          fb.q2_answer === 'ลองแล้วได้ผลดี'
                            ? 'bg-emerald-100 text-emerald-800'
                            : fb.q2_answer === 'กำลังดำเนินการ'
                            ? 'bg-amber-100 text-amber-800'
                            : fb.q2_answer === 'ไม่ได้ผล/ต้องการปรับปรุง'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {fb.q2_answer}
                        </span>
                        <div className="text-amber-500 text-xs">
                          {'★'.repeat(fb.user_felt_compat || 0)}
                          {'☆'.repeat(5 - (fb.user_felt_compat || 0))}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500 max-w-xs truncate" title={fb.q3_answer}>
                      {fb.q3_answer || '-'}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      {new Date(fb.created_at).toLocaleString('th-TH')}
                    </td>
                  </tr>
                ))}
                {feedbacks.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                      ยังไม่มีประวัติการบันทึกประเมินผลคำแนะนำในหน่วยงานนี้ คุณสามารถกด "ประเมินคำแนะนำนี้" ในบับเบิ้ลโค้ชด้านล่าง หรือปุ่มด้านบนเพื่อเพิ่มข้อมูลค่ะ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 📋 Modal: แบบฟอร์มประเมินคำแนะนำการบริหาร */}
        {showFeedbackModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100 flex flex-col p-6 animate-fade-in text-left">
              <div className="flex justify-between items-center border-b pb-4 mb-4">
                <h3 className="text-lg font-bold text-[#1A3A5C] flex items-center gap-2">
                  <span>📝</span> บันทึกและประเมินผลคำแนะนำการบริหาร
                </h3>
                <button
                  type="button"
                  onClick={() => setShowFeedbackModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveFeedback} className="space-y-4">
                {/* Scope Selection */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">ขอบเขตคำแนะนำ (Scope)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFeedbackForm(prev => ({ ...prev, targetType: 'team', targetName: 'ภาพรวมทีม', targetUserId: '' }))}
                      className={`py-2 px-4 rounded-xl text-xs font-bold transition-all border ${
                        feedbackForm.targetType === 'team'
                          ? 'bg-blue-50 border-blue-500 text-blue-800'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
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
                          ? 'bg-purple-50 border-purple-500 text-purple-800'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      👤 รายบุคคล (Individual)
                    </button>
                  </div>
                </div>

                {/* Target Selector */}
                {feedbackForm.targetType === 'team' ? (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">ระบุชื่อทีม / แผนก</label>
                    <input
                      type="text"
                      value={feedbackForm.targetName}
                      onChange={e => setFeedbackForm(prev => ({ ...prev, targetName: e.target.value }))}
                      placeholder="เช่น ภาพรวมทีม, ฝ่ายขาย, ทีมพัฒนา"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">เลือกพนักงานเป้าหมาย</label>
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
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-purple-500"
                      required
                    >
                      {membersList.length === 0 ? (
                        <option value="">ไม่มีข้อมูลพนักงานประเมินในหน่วยงานนี้</option>
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
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">คำแนะนำการบริหารที่ได้รับ</label>
                  <textarea
                    value={feedbackForm.recommendation}
                    onChange={e => setFeedbackForm(prev => ({ ...prev, recommendation: e.target.value }))}
                    placeholder="รายละเอียดคำแนะนำ หรือสิ่งที่ AI Coach ได้แนะนำ"
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-blue-500 focus:ring-0 resize-y"
                    required
                  />
                </div>

                {/* Implementation Status */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">สถานะการทดลองปรับใช้งาน</label>
                  <select
                    value={feedbackForm.status}
                    onChange={e => setFeedbackForm(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="ลองแล้วได้ผลดี">🟢 ลองแล้วได้ผลดี (Tried & Effective)</option>
                    <option value="กำลังดำเนินการ">🟡 กำลังดำเนินการ (In Progress)</option>
                    <option value="ยังไม่ได้ลอง">⚪ ยังไม่ได้ลอง (Not Tried Yet)</option>
                    <option value="ไม่ได้ผล/ต้องการปรับปรุง">🔴 ไม่ได้ผล/ต้องการปรับปรุง (Ineffective)</option>
                  </select>
                </div>

                {/* Rating selection (Stars) */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">คะแนนผลลัพธ์ / ความพึงพอใจการบริหาร (Rating)</label>
                  <div className="flex gap-2 justify-start items-center">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setFeedbackForm(prev => ({ ...prev, rating: star }))}
                        className={`text-2xl transition-all ${
                          star <= feedbackForm.rating
                            ? 'text-amber-400 scale-110'
                            : 'text-gray-200 hover:text-amber-200'
                        }`}
                      >
                        ★
                      </button>
                    ))}
                    <span className="text-xs font-bold text-gray-400 ml-2">({feedbackForm.rating} / 5 คะแนน)</span>
                  </div>
                </div>

                {/* Comment details */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">ความคิดเห็น / ผลลัพธ์จากการนำไปใช้เพิ่มเติม (Outcome comment)</label>
                  <textarea
                    value={feedbackForm.comment}
                    onChange={e => setFeedbackForm(prev => ({ ...prev, comment: e.target.value }))}
                    placeholder="ระบุสิ่งที่สมาชิกสะท้อนกลับ หรืออุปสรรคข้อจำกัดที่พบ"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-blue-500 focus:ring-0 resize-y"
                  />
                </div>

                {/* Submit / Cancel Actions */}
                <div className="flex justify-end gap-2 border-t pt-4 mt-2">
                  <button
                    type="button"
                    onClick={() => setShowFeedbackModal(false)}
                    className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingFeedback || !feedbackForm.recommendation.trim()}
                    className="px-5 py-2 bg-[#1A3A5C] hover:bg-[#2E75B6] disabled:bg-gray-200 text-white rounded-xl text-xs font-bold transition-colors shadow-md"
                  >
                    {isSubmittingFeedback ? 'กำลังบันทึก...' : 'บันทึกคำประเมิน'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>

      {/* 🧘‍♀️ EXECUTIVE AI COACH FLOATING CHAT WIDGET */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {/* Chat Panel */}
        {showExecChat && (
          <div className="bg-white/95 border border-gray-100 shadow-2xl rounded-2xl w-[90vw] max-w-md h-[500px] flex flex-col mb-4 overflow-hidden animate-fade-in text-left">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#1A3A5C] to-[#1D8B75] text-white p-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xl">💼</span>
                <div>
                  <h3 className="font-bold text-sm">Executive AI Coach</h3>
                  <p className="text-[0.65rem] text-teal-100">ผู้แนะนำการบริหารและดูแลสุขภาวะองค์กร</p>
                </div>
              </div>
              <button onClick={() => setShowExecChat(false)} className="text-white/80 hover:text-white text-xl">✕</button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
              {execMessages.map((msg, index) => (
                <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                  <div className={`max-w-[85%] rounded-2xl p-3.5 text-xs md:text-sm leading-relaxed text-left ${
                    msg.role === 'user'
                      ? 'bg-[#1A3A5C] text-white rounded-tr-none'
                      : 'bg-white text-gray-700 shadow-sm border border-gray-100 rounded-tl-none'
                  }`}>
                    {msg.role !== 'user' && (
                      <div className="flex justify-between items-center mb-1 gap-2 border-b border-gray-150 pb-1">
                        <span className="font-bold text-[0.65rem] text-[#1D8B75]">Executive AI Coach</span>
                        <button
                          type="button"
                          onClick={() => handlePrefillFeedback(msg.content)}
                          className="text-[0.55rem] bg-teal-50 hover:bg-teal-100 text-[#1D8B75] px-1.5 py-0.5 rounded border border-teal-200/50 flex items-center gap-1 transition-colors font-semibold"
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

              {execLoading && (
                <div className="flex justify-start">
                  <div className="bg-white text-gray-400 shadow-sm border rounded-2xl p-3 text-xs flex items-center gap-2">
                    <span className="animate-pulse">● ● ●</span> บอทกำลังประมวลสถิติและคำตอบ...
                  </div>
                </div>
              )}
            </div>

            {/* Quick Suggestions */}
            {showSuggestions && execOptions.length > 0 && !execLoading && (
              <div className="px-4 py-2 bg-white border-t flex flex-wrap gap-2 overflow-x-auto relative">
                <div className="w-full flex justify-between items-center mb-1 text-[10px] text-gray-400 font-semibold">
                  <span>💡 คำถามแนะนำ</span>
                  <button 
                    type="button" 
                    onClick={() => setShowSuggestions(false)}
                    className="hover:text-red-500 transition-colors"
                  >
                    ซ่อน ✕
                  </button>
                </div>
                {execOptions.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => sendExecMessage(opt)}
                    className="text-xs bg-blue-50 hover:bg-blue-100 border border-blue-100 text-[#1A3A5C] px-3 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* Indicator to show suggestions when hidden */}
            {!showSuggestions && execOptions.length > 0 && !execLoading && (
              <div className="px-4 py-1 bg-white border-t flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowSuggestions(true)}
                  className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                >
                  💡 แสดงคำถามแนะนำ
                </button>
              </div>
            )}

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendExecMessage(execInput);
              }}
              className="p-3 bg-white border-t flex gap-2"
            >
              <input
                type="text"
                value={execInput}
                onChange={(e) => setExecInput(e.target.value)}
                disabled={execLoading}
                placeholder="ปรึกษาการบริหารองค์กร/จัดกิจกรรมทีม..."
                className="flex-1 px-3.5 py-2 border border-gray-200 rounded-xl text-xs md:text-sm focus:outline-none focus:border-[#1D8B75] disabled:bg-gray-50"
              />
              <button
                type="submit"
                disabled={execLoading || !execInput.trim()}
                className="px-4 py-2 bg-[#1A3A5C] hover:bg-[#2E75B6] disabled:bg-gray-200 text-white rounded-xl text-xs font-bold transition-colors"
              >
                ส่ง
              </button>
            </form>
          </div>
        )}

        {/* Floating Bubble Button */}
        <button
          onClick={openExecChat}
          className="flex items-center gap-2 px-5 py-3 rounded-full bg-gradient-to-r from-[#1A3A5C] to-[#1D8B75] text-white shadow-xl hover:scale-105 transition-transform font-bold text-xs md:text-sm"
        >
          <span className="text-base">💼</span> ปรึกษา Executive AI Coach
        </button>
      </div>

    </div>
  );
}