'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
// นำเข้าแพ็กเกจสำหรับวาดกราฟ
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, today: 0 });
  const [quadrantData, setQuadrantData] = useState<any[]>([]);
  const [topArchetypes, setTopArchetypes] = useState<any[]>([]);
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  
  // 🚨 ตัวแปรใหม่สำหรับเก็บข้อมูลวิเคราะห์รายข้อ (Item Analysis)
  const [slowestQuestions, setSlowestQuestions] = useState<any[]>([]);
  const [fastestQuestions, setFastestQuestions] = useState<any[]>([]);

  // โทนสีของ KRUTH DEMM สำหรับกราฟ
  const COLORS = ['#1A3A5C', '#2E75B6', '#F59E0B', '#10B981', '#8B5CF6'];

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);
    
    // 1. ดึงข้อมูล Results ทั้งหมดพร้อมชื่อ Archetype
    const { data: results, error } = await supabase
      .from('results')
      .select(`
        id, 
        created_at, 
        quadrant_primary,
        archetype_id,
        archetypes ( name_th )
      `)
      .order('created_at', { ascending: false });

    if (error || !results) {
      console.error('Error fetching data:', error);
      setLoading(false);
      return;
    }

    // 2. คำนวณสถิติทั่วไป (KPIs)
    const total = results.length;
    const today = results.filter(r => new Date(r.created_at).toDateString() === new Date().toDateString()).length;
    setStats({ total, today });

    // 3. จัดกลุ่มข้อมูลสำหรับกราฟโดนัท (Quadrant Distribution)
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

    // 4. จัดกลุ่มข้อมูลสำหรับกราฟแท่ง (Top Archetypes)
    const archCount: Record<string, number> = {};
    results.forEach(r => {
      // ดึงชื่อไทย ถ้าไม่มีให้ใช้ ID แทน
      const archName = (r.archetypes as any)?.name_th || r.archetype_id;
      archCount[archName] = (archCount[archName] || 0) + 1;
    });
    const parsedTopArch = Object.keys(archCount)
      .map(key => ({ name: key, count: archCount[key] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // เอาแค่ Top 5
    setTopArchetypes(parsedTopArch);

    // 5. ข้อมูลล่าสุด 10 รายการสำหรับตาราง
    setRecentUsers(results.slice(0, 10));

    // 🚨 6. ดึงข้อมูลพฤติกรรมการตอบ (Item Analysis)
    const { data: analytics } = await supabase.from('quiz_analytics').select('question_id, time_spent_ms');
    
    if (analytics && analytics.length > 0) {
      const qStats: Record<string, { totalTime: number; count: number }> = {};
      
      // หาผลรวมเวลาและจำนวนคนตอบของแต่ละข้อ
      analytics.forEach(row => {
        if (!row.question_id) return;
        if (!qStats[row.question_id]) qStats[row.question_id] = { totalTime: 0, count: 0 };
        qStats[row.question_id].totalTime += row.time_spent_ms;
        qStats[row.question_id].count += 1;
      });

      // คำนวณค่าเฉลี่ยเป็น "วินาที"
      const qAverages = Object.keys(qStats).map(qId => ({
        id: qId,
        avgSec: (qStats[qId].totalTime / qStats[qId].count) / 1000,
        count: qStats[qId].count
      })).filter(q => q.count > 0); // เอาเฉพาะข้อที่มีคนตอบ

      // เรียงจากมากไปน้อย (คิดนานสุด)
      setSlowestQuestions([...qAverages].sort((a, b) => b.avgSec - a.avgSec).slice(0, 5));
      // เรียงจากน้อยไปมาก (ตอบเร็วสุด)
      setFastestQuestions([...qAverages].sort((a, b) => a.avgSec - b.avgSec).slice(0, 5));
    }

    setLoading(false);
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
              <span>📊</span> KRUTH DEMM Dashboard
            </h1>
            <p className="text-sm text-blue-200">สรุปข้อมูลผู้ใช้งานระบบประเมินบุคลิกภาพ</p>
          </div>
          <button onClick={fetchDashboardData} className="mt-4 md:mt-0 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm font-bold transition-colors">
            🔄 รีเฟรชข้อมูล
          </button>
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

      </div>
    </div>
  );
}