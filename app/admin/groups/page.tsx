'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
  archetype: string;
  quadrant: string;
}

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
            gender
          )
        `)
        .eq('org_id', selectedOrgId);
      if (mErr) throw mErr;

      const parsedMembers: Member[] = (mData || []).map((m: any) => ({
        user_id: m.user_id,
        role: m.role || 'member',
        full_name: m.users?.full_name || 'ไม่ทราบชื่อ',
        gender: m.users?.gender || 'O',
        archetype: '',
        quadrant: ''
      }));

      // 2. Fetch test results for these members to get their archetype
      if (parsedMembers.length > 0) {
        const userIds = parsedMembers.map(m => m.user_id);
        const { data: rData, error: rErr } = await supabase
          .from('results')
          .select('user_id, archetype_name_th, quadrant_primary')
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
            if (latestResults[m.user_id]) {
              m.archetype = latestResults[m.user_id].archetype_name_th;
              m.quadrant = latestResults[m.user_id].quadrant_primary;
            }
          });
        }
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

      </div>
    </div>
  );
}
