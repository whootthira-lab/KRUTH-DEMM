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
  kwi?: {
    vitality: number;
    meaning: number;
    connection: number;
    mastery: number;
    resilience: number;
  };
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
  const [analyzingGroupNo, setAnalyzingGroupNo] = useState<number | null>(null);

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

          return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100 flex flex-col p-6 animate-fade-in text-left">
                <div className="flex justify-between items-center border-b pb-4 mb-4">
                  <h3 className="text-lg font-bold text-[#1A3A5C] flex items-center gap-2">
                    <span>📊</span> วิเคราะห์แนวโน้มและการบริหาร — กลุ่มย่อยที่ {analyzingGroupNo}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setAnalyzingGroupNo(null)}
                    className="text-gray-400 hover:text-gray-600 text-xl font-bold"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Synergy Type Profile */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4.5 rounded-2xl border border-blue-100/50 space-y-2">
                    <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider block">สไตล์การประสานพลังทีม (Synergy Style)</span>
                    <h4 className="text-base font-black text-[#1A3A5C]">{analysis.synergyType}</h4>
                    <p className="text-xs text-gray-650 leading-relaxed">{analysis.synergyDesc}</p>
                  </div>

                  {/* KWI Wellness Dimension Averages */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">📊 สรุปค่าเฉลี่ยสุขภาวะกลุ่ม (Group Wellness Averages)</h4>
                    {analysis.hasKwi ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          { label: '🌟 พลังชีวิต (Vitality)', val: analysis.avg.vitality, color: 'bg-emerald-500' },
                          { label: '🧘 ความหมายชีวิต (Meaning)', val: analysis.avg.meaning, color: 'bg-indigo-500' },
                          { label: '💙 สายสัมพันธ์ (Connection)', val: analysis.avg.connection, color: 'bg-blue-500' },
                          { label: '🎯 การเติบโต (Mastery)', val: analysis.avg.mastery, color: 'bg-purple-500' },
                          { label: '🛡️ ความยืดหยุ่น (Resilience)', val: analysis.avg.resilience, color: 'bg-pink-500' },
                        ].map((dim, i) => (
                          <div key={i} className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex flex-col justify-between space-y-1">
                            <div className="flex justify-between items-center text-xs font-bold">
                              <span className="text-gray-600">{dim.label}</span>
                              <span className="text-[#1A3A5C]">{dim.val} / 5.0</span>
                            </div>
                            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full ${dim.color}`} style={{ width: `${(dim.val / 5) * 100}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-yellow-50 text-yellow-850 border border-yellow-100 p-4 rounded-xl text-center text-xs font-semibold">
                        ⚠️ สมาชิกในกลุ่มนี้ยังไม่ได้ทำแบบประเมินสุขภาวะจิตใจ KWI (ระบบจึงจำลองค่าเริ่มต้น 3.0/5.0 ไว้แทนก่อนชั่วคราวค่ะ)
                      </div>
                    )}
                  </div>

                  {/* Strengths & Cautions */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100/50 space-y-2">
                      <h5 className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                        <span>✅</span> จุดแข็งเด่นของกลุ่ม
                      </h5>
                      <ul className="list-disc list-inside text-xs text-gray-700 space-y-1 leading-relaxed pl-1">
                        {analysis.strengths.map((str, i) => (
                          <li key={i}>{str}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-rose-50/50 p-4 rounded-2xl border border-rose-100/50 space-y-2">
                      <h5 className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                        <span>⚠️</span> ข้อควรระวังในการร่วมงาน
                      </h5>
                      <ul className="list-disc list-inside text-xs text-gray-700 space-y-1 leading-relaxed pl-1">
                        {analysis.cautions.map((cau, i) => (
                          <li key={i}>{cau}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Manager Guidelines */}
                  <div className="bg-teal-50/50 p-4.5 rounded-2xl border border-teal-100/50 space-y-2">
                    <h5 className="text-xs font-bold text-teal-800 flex items-center gap-1.5">
                      <span>💡</span> แนวทางการบริหารจัดงาน (Management Guidelines)
                    </h5>
                    <p className="text-xs text-gray-755 leading-relaxed">{analysis.delegationTips}</p>
                  </div>

                  {/* Group Members detail table */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">👥 รายชื่อและบุคลิกภาพพนักงานในกลุ่ม</h4>
                    <div className="border border-gray-150 rounded-xl overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-4 py-2">ชื่อพนักงาน</th>
                            <th className="px-4 py-2">สไตล์พฤติกรรม (Archetype)</th>
                            <th className="px-4 py-2">กลุ่ม (Quadrant)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y text-gray-700">
                          {analysis.peers.map((peer, i) => (
                            <tr key={i} className="hover:bg-gray-50/30">
                              <td className="px-4 py-2 font-bold text-gray-800">{peer.full_name}</td>
                              <td className="px-4 py-2 text-gray-600">{peer.archetype || 'ยังไม่ได้ทำแบบทดสอบ'}</td>
                              <td className="px-4 py-2">
                                <span className={`px-2 py-0.5 rounded-full font-bold text-[0.65rem] ${
                                  peer.quadrant === 'Q1' ? 'bg-blue-100 text-blue-800' :
                                  peer.quadrant === 'Q2' ? 'bg-amber-100 text-amber-800' :
                                  peer.quadrant === 'Q3' ? 'bg-emerald-100 text-emerald-800' :
                                  peer.quadrant === 'Q4' ? 'bg-purple-100 text-purple-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {peer.quadrant || 'ไม่ระบุ'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end border-t pt-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setAnalyzingGroupNo(null)}
                    className="px-5 py-2 bg-[#1A3A5C] hover:bg-[#2E75B6] text-white rounded-xl text-xs font-bold transition-colors shadow-md"
                  >
                    ปิดหน้าต่าง
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
