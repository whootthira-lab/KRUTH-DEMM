'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface Organization {
  id: string;
  name: string;
  org_code: string;
  created_at: string;
  admin_email?: string;
}

export default function SuperDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalOrgs: 0 });
  const [kwiData, setKwiData] = useState<any[]>([]);
  const [quadrantData, setQuadrantData] = useState<any[]>([]);
  
  // Form States
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgCode, setNewOrgCode] = useState('');
  const [assignEmail, setAssignEmail] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Chatbot States
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOptions, setChatOptions] = useState<string[]>([]);

  const COLORS = ['#1A3A5C', '#2E75B6', '#F59E0B', '#10B981', '#8B5CF6'];

  useEffect(() => {
    // 1. Access Control
    const email = localStorage.getItem('kruth_admin_email');
    const role = localStorage.getItem('kruth_admin_role');

    if (!email || email !== 'whootthira@gmail.com' || role !== 'super_admin') {
      router.push('/admin');
      return;
    }

    fetchGlobalData();
  }, []);

  async function fetchGlobalData() {
    setLoading(true);
    try {
      // 1. Fetch all organizations
      const { data: dbOrgs } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      // 2. Fetch all admins to map emails
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

      // 3. Fetch overall user count
      const { count: usersCount } = await supabase
        .from('results')
        .select('*', { count: 'exact', head: true });

      setStats({
        totalUsers: usersCount || 0,
        totalOrgs: dbOrgs?.length || 0
      });

      // 4. Fetch overall KWI responses to calculate global averages
      const { data: kwiResponses } = await supabase
        .from('kwi_responses')
        .select('vitality, meaning, connection, mastery, resilience');

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
      }

      // 5. Fetch overall quadrant distribution
      const { data: results } = await supabase
        .from('results')
        .select('quadrant_primary');

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

    } catch (err) {
      console.error("Error fetching super admin dashboard data:", err);
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
      const { data, error } = await supabase
        .from('organizations')
        .insert({
          name: newOrgName.trim(),
          org_code: codeUpper
        })
        .select()
        .single();

      if (error) throw error;

      setMessage({ type: 'success', text: `สร้างหน่วยงาน "${newOrgName}" สำเร็จ!` });
      setNewOrgName('');
      setNewOrgCode('');
      fetchGlobalData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'ไม่สามารถสร้างหน่วยงานได้ (รหัสซ้ำ?)' });
    } finally {
      setActionLoading(false);
    }
  }

  // Action: Assign/Grant Admin email to organization
  async function handleAssignAdmin(orgId: string) {
    const emailToAssign = assignEmail[orgId]?.trim().toLowerCase();
    if (!emailToAssign) return;

    setActionLoading(true);
    setMessage({ type: '', text: '' });

    try {
      // Upsert into org_admins table
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
      fetchGlobalData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'เกิดข้อผิดพลาดในการบันทึกสิทธิ์' });
    } finally {
      setActionLoading(false);
    }
  }

  // Action: Impersonate (View a specific tenant's dashboard)
  function handleImpersonate(orgId: string, orgName: string) {
    localStorage.setItem('kruth_admin_org_id', orgId);
    localStorage.setItem('kruth_admin_org_name', orgName);
    router.push('/admin/dashboard');
  }

  // Action: Logout
  function handleLogout() {
    localStorage.clear();
    router.push('/admin');
  }

  // Chatbot Actions
  const openChat = async () => {
    setShowChat(true);
    if (chatMessages.length === 0) {
      setChatLoading(true);
      try {
        const res = await fetch('/api/admin/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId: 'global',
            message: 'สวัสดีค่ะ ช่วยสรุปภาพรวมสุขภาวะจิตใจเฉลี่ยของทุกองค์กร และให้คำแนะนำการส่งเสริมความสุขในระดับส่วนกลางหน่อยค่ะ',
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
          orgId: 'global',
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
        <span className="text-5xl animate-bounce mb-4">🦅</span>
        <h2 className="text-xl font-bold text-white animate-pulse">กำลังดึงข้อมูลภาพรวมระบบ...</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 text-slate-100 font-sans pb-16 animate-fade-in">
      
      {/* 👑 PREMIUM NAVBAR */}
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
        
        {/* 📢 Alerts */}
        {message.text && (
          <div className={`p-4 rounded-2xl text-xs md:text-sm font-bold border transition-all ${
            message.type === 'success' 
              ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300' 
              : 'bg-rose-950/40 border-rose-800/50 text-rose-300'
          }`}>
            {message.type === 'success' ? '✅' : '⚠️'} {message.text}
          </div>
        )}

        {/* 📊 OVERVIEW COUNTER CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="relative overflow-hidden rounded-2xl p-6 bg-slate-900/40 border border-white/5 backdrop-blur-md shadow-xl flex items-center gap-5">
            <span className="text-4xl bg-teal-500/10 text-teal-400 p-4 rounded-xl">👥</span>
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">ผู้ทำแบบประเมินทั้งหมด</p>
              <h2 className="text-3xl font-black mt-1 text-white">{stats.totalUsers.toLocaleString()} <span className="text-lg font-medium text-slate-400">คน</span></h2>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl p-6 bg-slate-900/40 border border-white/5 backdrop-blur-md shadow-xl flex items-center gap-5">
            <span className="text-4xl bg-blue-500/10 text-blue-400 p-4 rounded-xl">🏫</span>
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">หน่วยงาน/สถาบันการศึกษา</p>
              <h2 className="text-3xl font-black mt-1 text-white">{stats.totalOrgs.toLocaleString()} <span className="text-lg font-medium text-slate-400">แห่ง</span></h2>
            </div>
          </div>
        </div>

        {/* 🕸️ CHARTS PANEL */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Global KWI Scores */}
          <div className="lg:col-span-2 relative overflow-hidden rounded-2xl p-6 bg-slate-900/40 border border-white/5 backdrop-blur-md shadow-xl">
            <h3 className="font-bold text-sm text-slate-300 mb-6">📊 ค่าเฉลี่ยสุขภาวะระดับประเทศ (Overall KWI Score)</h3>
            <div className="w-full h-80">
              {kwiData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kwiData}>
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
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

          {/* Quadrant Distribution */}
          <div className="relative overflow-hidden rounded-2xl p-6 bg-slate-900/40 border border-white/5 backdrop-blur-md shadow-xl">
            <h3 className="font-bold text-sm text-slate-300 mb-6">🧩 สัดส่วนขั้วพฤติกรรมรวม (Quadrants)</h3>
            <div className="w-full h-64 flex items-center justify-center">
              {quadrantData.some(q => q.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={quadrantData.filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {quadrantData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} />
                    <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-xs text-slate-500">ไม่มีข้อมูลบุคลิกภาพ</div>
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
                className="px-4 py-1.5 bg-gradient-to-r from-teal-500 to-blue-500 text-white font-bold rounded-xl text-xs hover:opacity-90 transition-all"
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
      </div>

      {/* 🧘‍♀️ GLOBAL EXECUTIVE AI COACH CHATBOT WIDGET */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {showChat && (
          <div className="bg-[#0f172a]/95 border border-slate-800 shadow-2xl rounded-2xl w-[90vw] max-w-md h-[500px] flex flex-col mb-4 overflow-hidden text-left backdrop-blur-md">
            {/* Header */}
            <div className="bg-gradient-to-r from-teal-500 to-blue-600 text-white p-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xl">💼</span>
                <div>
                  <h3 className="font-bold text-sm">Global AI Executive Coach</h3>
                  <p className="text-[0.65rem] text-teal-100">ผู้แนะนำและวิเคราะห์แผนกลยุทธ์จิตวิทยาส่วนกลาง</p>
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
                      <span className="font-bold text-[0.65rem] text-teal-400 block mb-1">Global AI Coach</span>
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
                    <span className="animate-pulse">● ● ●</span> บอทกำลังประมวลสรุปทั้งประเทศ...
                  </div>
                </div>
              )}
            </div>

            {/* Suggestions */}
            {chatOptions.length > 0 && !chatLoading && (
              <div className="px-4 py-2 bg-slate-900/80 border-t border-slate-800 flex flex-wrap gap-2 overflow-x-auto">
                {chatOptions.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => sendChatMessage(opt)}
                    className="text-xs bg-teal-950/40 hover:bg-teal-900/40 border border-teal-900/30 text-teal-400 px-3 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap"
                  >
                    {opt}
                  </button>
                ))}
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
                placeholder="ปรึกษาวิเคราะห์สภาวะจิตพนักงานประเทศ..."
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
