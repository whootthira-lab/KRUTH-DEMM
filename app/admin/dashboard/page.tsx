'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
// นำเข้าแพ็กเกจสำหรับวาดกราฟ
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { usePrivacyTimeout } from '@/hooks/usePrivacyTimeout';
import { registerPasskey, authenticatePasskey } from '@/lib/webauthn-client';
import SecurityWatermarkWrapper from '@/components/SecurityWatermarkWrapper';

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
    <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3 shadow-sm text-left">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-gray-800">{label}</span>
        <span className="text-[10px] text-gray-400">ผู้ประเมิน {total} คน</span>
      </div>
      
      {/* Stacked bar */}
      <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden flex">
        {pctG > 0 && <div className="bg-emerald-500 h-full" style={{ width: `${pctG}%` }} title={`ปกติ: ${pctG}%`} />}
        {pctY > 0 && <div className="bg-amber-400 h-full" style={{ width: `${pctY}%` }} title={`เฝ้าระวัง: ${pctY}%`} />}
        {pctO > 0 && <div className="bg-orange-500 h-full" style={{ width: `${pctO}%` }} title={`เสี่ยงสูง: ${pctO}%`} />}
        {pctR > 0 && <div className="bg-rose-500 h-full" style={{ width: `${pctR}%` }} title={`เสี่ยงวิกฤต: ${pctR}%`} />}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-4 gap-1 text-[9px] text-gray-500 font-semibold text-center pt-1 border-t border-gray-50">
        <div>🟢 {green} คน</div>
        <div>🟡 {yellow} คน</div>
        <div>🟠 {orange} คน</div>
        <div className="text-rose-600 font-bold">🔴 {red} คน</div>
      </div>
    </div>
  );
}

export default function ExecutiveDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState('กำลังโหลด...');
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
  
  // 🔒 Security & Zero-Trust Privacy States
  const [isVerified, setIsVerified] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [userRole, setUserRole] = useState<string>('org_admin');
  const [authError, setAuthError] = useState<string | null>(null);
  const [adminUserId, setAdminUserId] = useState<string>('');
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [orgId, setOrgId] = useState<string>('');
  const [adminName, setAdminName] = useState<string>('');
  
  // OTP fallback flow states
  const [showOtpFallback, setShowOtpFallback] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [otpLoading, setOtpLoading] = useState(false);
  const [devOtpCode, setDevOtpCode] = useState(''); // ไม่ใช้แล้ว — เก็บไว้ไม่ให้ TypeScript error

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

  // 🎯 Dynamic Scenario Registry Builder States
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(false);
  const [showScenarioDrawer, setShowScenarioDrawer] = useState(false);
  const [activeWizardStep, setActiveWizardStep] = useState(1);
  const [isSavingScenario, setIsSavingScenario] = useState(false);

  // Form Wizard Fields
  const [scenarioId, setScenarioId] = useState(''); // for editing
  const [scenarioName, setScenarioName] = useState('');
  const [projectType, setProjectType] = useState('esports_rov');
  
  // Telemetry constraints
  const [goldDiffLimit, setGoldDiffLimit] = useState('');
  const [outOfBaseDepth, setOutOfBaseDepth] = useState('');
  const [avgMemberDistance, setAvgMemberDistance] = useState('');
  const [deathIntervalSeconds, setDeathIntervalSeconds] = useState('');
  const [conflictingDashMoveRatio, setConflictingDashMoveRatio] = useState('');

  // Voice constraints
  const [voiceKeywords, setVoiceKeywords] = useState('');
  const [vviThreshold, setVviThreshold] = useState(3.5);
  const [silentTiltEnabled, setSilentTiltEnabled] = useState(false);
  const [concurrentConflictSeconds, setConcurrentConflictSeconds] = useState('');

  // Output action
  const [aiOutputMacroScript, setAiOutputMacroScript] = useState('');

  async function fetchScenarios(orgId: string) {
    try {
      setScenariosLoading(true);
      const res = await fetch(`/api/admin/scenarios?org_id=${orgId}`);
      const json = await res.json();
      if (json.data) {
        setScenarios(json.data);
      }
    } catch (err) {
      console.error('Error fetching scenarios:', err);
    } finally {
      setScenariosLoading(false);
    }
  }

  const handleOpenNewScenario = () => {
    setScenarioId('');
    setScenarioName('');
    setProjectType('esports_rov');
    setGoldDiffLimit('');
    setOutOfBaseDepth('');
    setAvgMemberDistance('');
    setDeathIntervalSeconds('');
    setConflictingDashMoveRatio('');
    setVoiceKeywords('');
    setVviThreshold(3.5);
    setSilentTiltEnabled(false);
    setConcurrentConflictSeconds('');
    setAiOutputMacroScript('');
    setActiveWizardStep(1);
    setShowScenarioDrawer(true);
  };

  const handleOpenEditScenario = (sc: any) => {
    setScenarioId(sc.id);
    setScenarioName(sc.scenario_name);
    setProjectType(sc.project_type);
    
    // Telemetry constraints
    const tc = sc.telemetry_constraints || {};
    setGoldDiffLimit(tc.gold_diff_limit || '');
    setOutOfBaseDepth(tc.out_of_base_depth || '');
    setAvgMemberDistance(tc.avg_member_distance || '');
    setDeathIntervalSeconds(tc.death_interval_seconds || '');
    setConflictingDashMoveRatio(tc.conflicting_dash_move_ratio || '');

    // Voice constraints
    const vc = sc.voice_constraints || {};
    setVoiceKeywords((vc.keywords || []).join(', '));
    setVviThreshold(vc.vvi_floor || vc.vvi_ceiling || 3.5);
    setSilentTiltEnabled(!!vc.silent_tilt_enabled);
    setConcurrentConflictSeconds(vc.concurrent_conflict_seconds || '');

    setAiOutputMacroScript(sc.ai_output_macro_script);
    setActiveWizardStep(1);
    setShowScenarioDrawer(true);
  };

  const handleDeleteScenario = async (id: string) => {
    if (!confirm('คุณแน่ใจหรือไม่ที่จะลบฉากทัศน์กลยุทธ์นี้?')) return;
    try {
      const res = await fetch(`/api/admin/scenarios?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        const orgId = localStorage.getItem('kruth_admin_org_id') || '';
        await fetchScenarios(orgId);
      } else {
        alert('ลบไม่สำเร็จ: ' + json.error);
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  const handleToggleScenarioActive = async (sc: any) => {
    try {
      const res = await fetch('/api/admin/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sc.id,
          org_id: sc.org_id,
          creator_id: sc.creator_id,
          scenario_name: sc.scenario_name,
          project_type: sc.project_type,
          telemetry_constraints: sc.telemetry_constraints,
          voice_constraints: sc.voice_constraints,
          ai_output_macro_script: sc.ai_output_macro_script,
          is_active: !sc.is_active
        })
      });
      const json = await res.json();
      if (json.success) {
        const orgId = localStorage.getItem('kruth_admin_org_id') || '';
        await fetchScenarios(orgId);
      }
    } catch (err) {
      console.error('Error toggling scenario state:', err);
    }
  };

  const handleSaveScenario = async () => {
    if (!scenarioName.trim() || !aiOutputMacroScript.trim()) {
      alert('กรุณากรอกข้อมูล ชื่อฉากทัศน์ และ ใบสั่งงาน AI/ปุ่มด่วน ให้ครบถ้วน');
      return;
    }

    setIsSavingScenario(true);
    try {
      const orgId = localStorage.getItem('kruth_admin_org_id') || '';
      const email = localStorage.getItem('kruth_admin_email') || 'admin';

      // Compile JSONB constraints
      const telemetry_constraints: any = {};
      if (goldDiffLimit) telemetry_constraints.gold_diff_limit = Number(goldDiffLimit);
      if (outOfBaseDepth) telemetry_constraints.out_of_base_depth = Number(outOfBaseDepth);
      if (avgMemberDistance) telemetry_constraints.avg_member_distance = Number(avgMemberDistance);
      if (deathIntervalSeconds) telemetry_constraints.death_interval_seconds = Number(deathIntervalSeconds);
      if (conflictingDashMoveRatio) telemetry_constraints.conflicting_dash_move_ratio = Number(conflictingDashMoveRatio);

      const voice_constraints: any = {
        keywords: voiceKeywords.split(',').map(k => k.trim()).filter(Boolean),
        vvi_floor: Number(vviThreshold),
        silent_tilt_enabled: silentTiltEnabled
      };
      if (concurrentConflictSeconds) voice_constraints.concurrent_conflict_seconds = Number(concurrentConflictSeconds);

      const res = await fetch('/api/admin/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: scenarioId || undefined,
          org_id: orgId,
          creator_id: email,
          scenario_name: scenarioName,
          project_type: projectType,
          telemetry_constraints,
          voice_constraints,
          ai_output_macro_script: aiOutputMacroScript,
          is_active: true
        })
      });

      const json = await res.json();
      if (json.success) {
        setShowScenarioDrawer(false);
        await fetchScenarios(orgId);
      } else {
        alert('บันทึกไม่สำเร็จ: ' + json.error);
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setIsSavingScenario(false);
    }
  };

  const handleAISmartSuggest = () => {
    const name = scenarioName.toLowerCase();
    if (name.includes('bait') || name.includes('ล่อ') || name.includes('หลอก')) {
      setGoldDiffLimit('1500');
      setOutOfBaseDepth('500');
      setVoiceKeywords('เลือดน้อย, ตามได้, ไล่ๆ, ไปต่อ');
      setVviThreshold(3.6);
      setAiOutputMacroScript('🔘 สั่งดึงจังหวะถอยคุมพื้นที่ | คำเตือน: ศัตรูหายไปจากแผนที่ 3 ตัว เสี่ยงโดนล่อซุ่มโจมตี');
      alert('AI แนะนำเงื่อนไขสำหรับฉากทัศน์ "โดนล่อออกนอกฐาน (Baiting)" เรียบร้อยแล้วค่ะ');
    } else if (name.includes('pick') || name.includes('แยก') || name.includes('เดี่ยว')) {
      setAvgMemberDistance('900');
      setDeathIntervalSeconds('15');
      setVoiceKeywords('ช่วยด้วย, ไม่ทัน, โดนดัก, รุม');
      setVviThreshold(3.7);
      setSilentTiltEnabled(true);
      setAiOutputMacroScript('🔘 สั่งรวมกลุ่มคุมเลนกลาง | คำเตือน: รูปเกมกระจายตัวเกินเกณฑ์ปลอดภัย บังคับส่งสัญญาณสลับมาเดินคู่');
      alert('AI แนะนำเงื่อนไขสำหรับฉากทัศน์ "แยกกันเดินจนโดนเก็บ (Pick-offs)" เรียบร้อยแล้วค่ะ');
    } else if (name.includes('hesit') || name.includes('ลังเล') || name.includes('สู้ไม่สุด')) {
      setConflictingDashMoveRatio('0.75');
      setVoiceKeywords('เข้า, ถอย, เอาไงดี, ขัดแย้ง');
      setVviThreshold(3.5);
      setConcurrentConflictSeconds('1.0');
      setAiOutputMacroScript('🔘 สั่งให้ถอยเซฟแนวหลัง | บันทึกสถิติ: เพิ่มดัชนีความย้อนแย้งทางปริชานในคลังพัฒนาการระยะยาว');
      alert('AI แนะนำเงื่อนไขสำหรับฉากทัศน์ "ลังเลตัดสินใจขัดแย้ง (Hesitation)" เรียบร้อยแล้วค่ะ');
    } else {
      setGoldDiffLimit('2000');
      setAvgMemberDistance('800');
      setVoiceKeywords('กันบ้าน, เอาหน่อย, ลุย');
      setVviThreshold(3.5);
      setAiOutputMacroScript('🔘 สั่งคุมพื้นที่เชิงรับ | คำเตือน: AI ตรวจพบความเครียดน้ำเสียงคอลเกมและกำลังทีมกระจายตัว');
      alert('AI ทำการค้นหาประวัติแมตช์ความพ่ายแพ้ในอดีต และแนะนำเงื่อนไขเฉลี่ยเริ่มต้นให้เรียบร้อยแล้วค่ะ');
    }
  };

  // โทนสีของ KRUTH DEMM สำหรับกราฟ
  const COLORS = ['#1A3A5C', '#2E75B6', '#F59E0B', '#10B981', '#8B5CF6'];

  // 🔒 Zero-Trust Inactivity & Tab-Switching Lock hook
  usePrivacyTimeout({
    isActive: isVerified && !isLocked && userRole !== 'coach',
    onTimeout: () => {
      setIsLocked(true);
    }
  });

  // 🔒 Zero-Trust Audit Logging helper
  async function writeAuditLog(
    targetMemberId?: string,
    actionName: string = 'EXECUTIVE_DASHBOARD_ACCESS',
    actionType: string = 'VIEW',
    targetResourceId?: string,
    metadata: any = {}
  ) {
    try {
      const email = localStorage.getItem('kruth_admin_email') || 'unknown';
      const orgId = localStorage.getItem('kruth_admin_org_id') || 'unknown';
      if (orgId === 'unknown') return;

      const payload = {
        executive_id: email,
        org_id: orgId,
        target_member_id: targetMemberId,
        access_granted_to: actionName,
        action_type: actionType,
        target_resource_id: targetResourceId,
        metadata
      };

      const res = await fetch('/api/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('Audit log failed:', data.error);
      }
    } catch (e) {
      console.error('Audit log error:', e);
    }
  }

  // 🔒 Passkey authentication logic
  const handlePasskeyUnlock = async () => {
    setAuthError(null);
    try {
      const email = localStorage.getItem('kruth_admin_email');
      if (!email) {
        setAuthError('ไม่พบอีเมลผู้ใช้งานในระบบ');
        return;
      }

      let resolvedUserId = adminUserId;
      if (!resolvedUserId) {
        const { data: uData } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
        if (uData) {
          resolvedUserId = uData.id;
        } else {
          const { data: aData } = await supabase.from('org_admins').select('id').eq('email', email).maybeSingle();
          resolvedUserId = aData ? aData.id : email;
        }
        setAdminUserId(resolvedUserId);
      }

      const verified = await authenticatePasskey(resolvedUserId);
      if (verified) {
        setIsVerified(true);
        setIsLocked(false);
        writeAuditLog(resolvedUserId, 'EXECUTIVE_GATEWAY_UNLOCK_PASSKEY');
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || 'การยืนยันตัวตนด้วย Passkey ล้มเหลว');
    }
  };

  // 🔒 Email OTP request logic
  const handleRequestOtp = async () => {
    setAuthError(null);
    setOtpLoading(true);
    try {
      const email = localStorage.getItem('kruth_admin_email');
      if (!email) {
        setAuthError('ไม่พบอีเมลผู้ใช้งานในระบบ');
        return;
      }

      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', email })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'ไม่สามารถส่งรหัส OTP ได้');
      }

      setOtpSent(true);
      setOtpAttempts(0);
      // Real Supabase OTP email sent — no devOtp returned in production
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setOtpLoading(false);
    }
  };

  // 🔒 Email OTP verification logic
  const handleVerifyOtp = async () => {
    setAuthError(null);
    setOtpLoading(true);
    try {
      if (!enteredOtp.trim()) {
        setAuthError('กรุณากรอกรหัส OTP');
        return;
      }

      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', enteredOtp: enteredOtp.trim() })
      });
      const data = await res.json();
      
      if (!res.ok) {
        setOtpAttempts(data.attempts || 0);
        if (data.attempts >= 5) {
          setOtpSent(false);
          setEnteredOtp('');
          throw new Error('คุณกรอกรหัสผิดครบ 5 ครั้งแล้ว กรุณากดขอรหัสใหม่');
        }
        throw new Error(data.error || 'รหัส OTP ไม่ถูกต้อง');
      }

      if (data.verified) {
        setIsVerified(true);
        setIsLocked(false);
        setOtpSent(false);
        setEnteredOtp('');
        setShowOtpFallback(false);
        writeAuditLog(undefined, 'EXECUTIVE_GATEWAY_UNLOCK_OTP');
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setOtpLoading(false);
    }
  };

  // 🔒 Passkey device registration helper
  const handleRegisterPasskey = async () => {
    try {
      const email = localStorage.getItem('kruth_admin_email');
      if (!email) return;

      let resolvedUserId = adminUserId;
      if (!resolvedUserId) {
        const { data: uData } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
        if (uData) {
          resolvedUserId = uData.id;
        } else {
          const { data: aData } = await supabase.from('org_admins').select('id').eq('email', email).maybeSingle();
          resolvedUserId = aData ? aData.id : email;
        }
        setAdminUserId(resolvedUserId);
      }

      await registerPasskey(resolvedUserId);
      alert('🎉 ลงทะเบียนอุปกรณ์นี้ด้วย Passkey เรียบร้อยแล้ว! สามารถใช้สแกนใบหน้า/นิ้วมือเพื่อปลดล็อกในครั้งถัดไป');
      writeAuditLog(resolvedUserId, 'EXECUTIVE_PASSKEY_DEVICE_REGISTER');
    } catch (err: any) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการลงทะเบียน Passkey: ' + err.message);
    }
  };

  useEffect(() => {
    // Access Control check
    const email = localStorage.getItem('kruth_admin_email');
    const orgId = localStorage.getItem('kruth_admin_org_id');
    const storedOrgName = localStorage.getItem('kruth_admin_org_name');
    const role = localStorage.getItem('kruth_admin_role') || 'org_admin';

    // Allow regular org_admin, super_admin and coach
    if (!email || !orgId || (role !== 'org_admin' && role !== 'super_admin' && role !== 'coach')) {
      router.push('/admin');
      return;
    }

    setAdminEmail(email);
    setOrgId(orgId);
    setAdminName(localStorage.getItem('kruth_admin_full_name') || '');
    setUserRole(role);
    setIsSuperAdmin(role === 'super_admin');
    
    if (role === 'coach') {
      setIsLocked(false);
      setIsVerified(true);
    } else {
      setIsLocked(true);
      setIsVerified(false);
    }

    if (storedOrgName) {
      setOrgName(storedOrgName);
    }

    fetchDashboardData(orgId);

    // Zero-Trust lookup for userId to support WebAuthn
    if (email) {
      supabase.from('users').select('id').eq('email', email).maybeSingle().then(({ data: uData }) => {
        if (uData) {
          setAdminUserId(uData.id);
        } else {
          supabase.from('org_admins').select('id').eq('email', email).maybeSingle().then(({ data: aData }) => {
            if (aData) {
              setAdminUserId(aData.id);
            } else {
              setAdminUserId(email);
            }
          });
        }
      });
    }
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

      // 10. Fetch custom scenarios
      await fetchScenarios(orgId);

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
    <SecurityWatermarkWrapper adminEmail={adminEmail} adminName={adminName} orgId={orgId} enabled={isVerified && !isLocked && userRole !== 'coach'}>
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
            {userRole !== 'coach' && (
              <>
                <button 
                  onClick={() => router.push('/admin/groups')} 
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all"
                >
                  👥 จัดการกลุ่มย่อย
                </button>
                <button 
                  onClick={handleRegisterPasskey}
                  className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <span>🔑</span> ผูกอุปกรณ์ Passkey
                </button>
              </>
            )}
            <button onClick={() => fetchDashboardData()} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm font-bold transition-colors">
              🔄 รีเฟรชข้อมูล
            </button>
            <button 
              onClick={() => {
                localStorage.clear();
                router.push('/admin');
              }} 
              className="bg-rose-950/40 hover:bg-rose-900/40 text-rose-400 border border-rose-900/30 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
            >
              🚪 ออกจากระบบ
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
              <div className="w-full h-96">
                {stats.total > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={[
                      { name: 'ซึมเศร้า', '🟢 ปกติ': clinicalStats.rain['🟢'], '🟡 เฝ้าระวัง': clinicalStats.rain['🟡'], '🟠 เสี่ยงสูง': clinicalStats.rain['🟠'], '🔴 วิกฤต': clinicalStats.rain['🔴'] },
                      { name: 'ก้าวร้าว', '🟢 ปกติ': clinicalStats.bolt['🟢'], '🟡 เฝ้าระวัง': clinicalStats.bolt['🟡'], '🟠 เสี่ยงสูง': clinicalStats.bolt['🟠'], '🔴 วิกฤต': clinicalStats.bolt['🔴'] },
                      { name: 'ถดถอย', '🟢 ปกติ': clinicalStats.fog['🟢'], '🟡 เฝ้าระวัง': clinicalStats.fog['🟡'], '🟠 เสี่ยงสูง': clinicalStats.fog['🟠'], '🔴 วิกฤต': clinicalStats.fog['🔴'] },
                      { name: 'กังวลสังคม', '🟢 ปกติ': clinicalStats.socialanxiety['🟢'], '🟡 เฝ้าระวัง': clinicalStats.socialanxiety['🟡'], '🟠 เสี่ยงสูง': clinicalStats.socialanxiety['🟠'], '🔴 วิกฤต': clinicalStats.socialanxiety['🔴'] },
                      { name: 'ย้ำคิดย้ำทำ', '🟢 ปกติ': clinicalStats.ocd['🟢'], '🟡 เฝ้าระวัง': clinicalStats.ocd['🟡'], '🟠 เสี่ยงสูง': clinicalStats.ocd['🟠'], '🔴 วิกฤต': clinicalStats.ocd['🔴'] },
                      { name: 'หมดไฟ', '🟢 ปกติ': clinicalStats.burnout['🟢'], '🟡 เฝ้าระวัง': clinicalStats.burnout['🟡'], '🟠 เสี่ยงสูง': clinicalStats.burnout['🟠'], '🔴 วิกฤต': clinicalStats.burnout['🔴'] },
                      { name: 'สมาธิสั้น', '🟢 ปกติ': clinicalStats.adhd['🟢'], '🟡 เฝ้าระวัง': clinicalStats.adhd['🟡'], '🟠 เสี่ยงสูง': clinicalStats.adhd['🟠'], '🔴 วิกฤต': clinicalStats.adhd['🔴'] },
                      { name: 'หลงผิด', '🟢 ปกติ': clinicalStats.delusion['🟢'], '🟡 เฝ้าระวัง': clinicalStats.delusion['🟡'], '🟠 เสี่ยงสูง': clinicalStats.delusion['🟠'], '🔴 วิกฤต': clinicalStats.delusion['🔴'] }
                    ]} margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
                      <XAxis type="number" stroke="#6b7280" fontSize={9} tickLine={false} />
                      <YAxis dataKey="name" type="category" stroke="#6b7280" fontSize={9} tickLine={false} width={80} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '12px' }} />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
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
                      {fb.target_role === 'individual' && userRole === 'coach' ? '🔒 [ข้อมูลถูกปิดบังโดยระบบความปลอดภัย]' : fb.target_desc}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-600 max-w-xs truncate" title={fb.target_role === 'individual' && userRole === 'coach' ? 'ข้อมูลถูกปิดบัง' : fb.q1_answer}>
                      {fb.target_role === 'individual' && userRole === 'coach' ? '🔒 ข้อมูลถูกจำกัดสิทธิ์การเข้าถึง' : fb.q1_answer}
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
                    <td className="px-6 py-4 text-xs text-gray-500 max-w-xs truncate" title={fb.target_role === 'individual' && userRole === 'coach' ? 'ข้อมูลถูกปิดบัง' : fb.q3_answer}>
                      {fb.target_role === 'individual' && userRole === 'coach' ? '🔒 ข้อมูลถูกจำกัดสิทธิ์การเข้าถึง' : (fb.q3_answer || '-')}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      {new Date(fb.created_at).toLocaleString('th-TH')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 🎯 ส่วนจัดการคลังฉากทัศน์กลยุทธ์ (Dynamic Scenario Registry Builder) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6 text-left">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-4 gap-4">
            <div>
              <h3 className="font-bold text-[#1A3A5C] text-lg flex items-center gap-2">
                <span>🎯</span> คลังฉากทัศน์และแผนกลยุทธ์ทีม (Strategic Scenario Registry)
              </h3>
              <p className="text-xs text-gray-500">จัดการแผนรับมือตรรกะ AI และสติกเกอร์ปุ่มสั่งการ Quick Macros ขององค์กร</p>
            </div>
            <button
              onClick={handleOpenNewScenario}
              className="bg-[#1D8B75] hover:bg-[#156E5C] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <span>➕</span> เพิ่มฉากทัศน์กลยุทธ์ใหม่
            </button>
          </div>

          {scenariosLoading ? (
            <div className="text-center py-8 text-xs text-gray-400 animate-pulse">กำลังโหลดคลังฉากทัศน์...</div>
          ) : scenarios.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-400">
              ยังไม่มีการตั้งค่าฉากทัศน์เฉพาะของหน่วยงานนี้ (ระบบจะใช้การดักจับค่าความเสี่ยงตามมาตรฐานเริ่มต้น)
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scenarios.map((sc) => {
                const tc = sc.telemetry_constraints || {};
                const vc = sc.voice_constraints || {};
                return (
                  <div
                    key={sc.id}
                    className={`border rounded-2xl p-5 shadow-xs transition-all relative ${
                      sc.is_active ? 'border-emerald-100 bg-emerald-50/10' : 'border-gray-100 bg-gray-50/20 opacity-60'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700">
                          {sc.project_type === 'esports_rov' ? '🎮 ROV Strategic' : '🏢 Corporate Crisis'}
                        </span>
                        <h4 className="font-bold text-sm text-gray-800 mt-1">{sc.scenario_name}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Active Toggle Switch */}
                        <button
                          onClick={() => handleToggleScenarioActive(sc)}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ${
                            sc.is_active ? 'bg-emerald-500' : 'bg-gray-300'
                          }`}
                        >
                          <div
                            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                              sc.is_active ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Constraints Summary */}
                    <div className="space-y-2 mb-4 text-xs text-gray-600">
                      {/* Telemetry constraints */}
                      <div className="flex items-start gap-1.5">
                        <span className="font-bold text-[#1A3A5C]">📊 เงื่อนไขเกม:</span>
                        <span className="bg-white/80 border border-gray-100 rounded-md px-1.5 py-0.5 text-[10px]">
                          {Object.keys(tc).length > 0 ? (
                            Object.keys(tc).map((k) => {
                              if (k === 'gold_diff_limit') return `ส่วนต่างเงิน < -${tc[k]}`;
                              if (k === 'out_of_base_depth') return `พิกัดนอกฐาน > ${tc[k]}ม.`;
                              if (k === 'avg_member_distance') return `ระยะกระจายทีม > ${tc[k]}ม.`;
                              if (k === 'death_interval_seconds') return `สมาชิกร่วงต่อคิว < ${tc[k]}วิ`;
                              if (k === 'conflicting_dash_move_ratio') return `สัดส่วนสั่งขัดแย้ง > ${tc[k]}`;
                              return `${k}: ${tc[k]}`;
                            }).join(' | ')
                          ) : (
                            'ไม่มีตัวเลขเงื่อนไขดักจับ'
                          )}
                        </span>
                      </div>

                      {/* Voice constraints */}
                      <div className="flex items-start gap-1.5">
                        <span className="font-bold text-[#1A3A5C]">🎙️ สัญญาณเสียง:</span>
                        <span className="bg-white/80 border border-gray-100 rounded-md px-1.5 py-0.5 text-[10px]">
                          VVI ≥ {vc.vvi_floor || vc.vvi_ceiling || '3.5'} 
                          {vc.keywords && vc.keywords.length > 0 && ` | คำดักจับ: "${vc.keywords.join(', ')}"`}
                          {vc.silent_tilt_enabled && ` | ตรวจจับ Silent Tilt`}
                        </span>
                      </div>

                      {/* Action Script */}
                      <div className="mt-2 pt-2 border-t border-dashed border-gray-100 flex items-start gap-1.5 font-sans">
                        <span className="font-bold text-[#1A3A5C] shrink-0">🤖 ใบสั่งงาน AI:</span>
                        <span className="text-[11px] text-gray-700 italic font-mono break-all">{sc.ai_output_macro_script}</span>
                      </div>
                    </div>

                    {/* Actions buttons */}
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleOpenEditScenario(sc)}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        ✏️ แก้ไขเงื่อนไข
                      </button>
                      <button
                        onClick={() => handleDeleteScenario(sc.id)}
                        className="text-[11px] font-bold text-rose-600 hover:text-rose-800 transition-colors"
                      >
                        🗑️ ลบแผน
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 📋 Form Wizard Drawer: สร้าง/แก้ไขฉากทัศน์กลยุทธ์ */}
        {showScenarioDrawer && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex justify-end">
            <div className="bg-white w-full max-w-lg h-full shadow-2xl flex flex-col p-6 text-left animate-slide-in overflow-y-auto">
              <div className="flex justify-between items-center border-b pb-4 mb-4">
                <h3 className="text-lg font-bold text-[#1A3A5C] flex items-center gap-2">
                  <span>➕</span> {scenarioId ? 'แก้ไขฉากทัศน์กลยุทธ์' : 'สร้างฉากทัศน์กลยุทธ์ทีมใหม่'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowScenarioDrawer(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Wizard Steps indicator */}
              <div className="flex justify-between items-center mb-6 bg-gray-50 rounded-xl p-3 text-[10px] md:text-xs font-bold text-gray-450">
                <span className={activeWizardStep === 1 ? 'text-[#1D8B75]' : ''}>1. ตั้งชื่อและหมวดหมู่</span>
                <span>➔</span>
                <span className={activeWizardStep === 2 ? 'text-[#1D8B75]' : ''}>2. ตรรกะเงื่อนไข</span>
                <span>➔</span>
                <span className={activeWizardStep === 3 ? 'text-[#1D8B75]' : ''}>3. คำพูด & เสียง</span>
                <span>➔</span>
                <span className={activeWizardStep === 4 ? 'text-[#1D8B75]' : ''}>4. แนะนำคำสั่ง</span>
              </div>

              {/* Wizard Content */}
              <div className="flex-1 space-y-4">
                
                {/* STEP 1: Basic Identity */}
                {activeWizardStep === 1 && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-xs text-[#1A3A5C] uppercase tracking-wider">ขั้นตอนที่ 1: ข้อมูลตั้งต้นแผนกลยุทธ์</h4>
                    
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">ชื่อฉากทัศน์/แผน (เช่น แผนรับมือการล่อซุ่มโจมตี)</label>
                      <input
                        type="text"
                        value={scenarioName}
                        onChange={(e) => setScenarioName(e.target.value)}
                        placeholder="กรอกชื่อแผนกลยุทธ์ดักจับ..."
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1D8B75]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">ประเภทโหมดโครงการ (Project Type)</label>
                      <select
                        value={projectType}
                        onChange={(e) => setProjectType(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1D8B75]"
                      >
                        <option value="esports_rov">🎮 โหมดจำลองทีมแข่ง E-Sports (RoV)</option>
                        <option value="corporate_crisis">🏢 โหมดการบริหารจัดการวิกฤตองค์กร (Corporate)</option>
                      </select>
                    </div>

                    {/* AI Smart Suggest Trigger */}
                    <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 mt-6">
                      <div className="flex items-start gap-2.5">
                        <span className="text-xl">💡</span>
                        <div className="space-y-1">
                          <h5 className="text-xs font-bold text-amber-800">ผู้ช่วยอัจฉริยะ AI Smart Suggest</h5>
                          <p className="text-[10px] text-amber-700">
                            พิมพ์คีย์เวิร์ดชื่อแผนด้านบน (เช่น "ล่อ", "แยก", "ลังเล") จากนั้นกดปุ่มด้านล่าง 
                            AI จะสแกนข้อมูลสถิติที่เคยพ่ายแพ้ในประวัติศาสตร์แมตช์ซ้อม เพื่อแนะนำเงื่อนไขตัวเลขและ VVI ที่เหมาะสมให้อัตโนมัติในคลิกเดียวค่ะ!
                          </p>
                          <button
                            type="button"
                            onClick={handleAISmartSuggest}
                            disabled={!scenarioName.trim()}
                            className="mt-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-lg transition-colors disabled:opacity-40"
                          >
                            ให้ AI ค้นหาสถิติประวัติและแนะนำเงื่อนไข
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: Telemetry Constraints */}
                {activeWizardStep === 2 && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-xs text-[#1A3A5C] uppercase tracking-wider">ขั้นตอนที่ 2: ตั้งตรรกะตัวเลขดักจับ (Telemetry Trigger)</h4>
                    
                    {projectType === 'esports_rov' ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">ส่วนต่างเงินในแผนที่เมื่อเริ่มวิกฤต (ติดลบทอง)</label>
                          <input
                            type="number"
                            value={goldDiffLimit}
                            onChange={(e) => setGoldDiffLimit(e.target.value)}
                            placeholder="เช่น 1500 (ทองเสียเปรียบมากกว่า 1,500)"
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1D8B75]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">ระยะห่างวิ่งหลุดแนวป้องปราการความลึก (เมตร)</label>
                          <input
                            type="number"
                            value={outOfBaseDepth}
                            onChange={(e) => setOutOfBaseDepth(e.target.value)}
                            placeholder="เช่น 500 (วิ่งฉีกหลุดลึกกว่า 500 เมตร)"
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1D8B75]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">ระยะห่างเฉลี่ยความกระจายตัวของสมาชิกทีม (เมตร)</label>
                          <input
                            type="number"
                            value={avgMemberDistance}
                            onChange={(e) => setAvgMemberDistance(e.target.value)}
                            placeholder="เช่น 800 (ห่างเฉลี่ยเกิน 800 เมตร)"
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1D8B75]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">ความถี่เกิดสมาชิกตายเรียงลำดับไล่เลี่ยกัน (วินาที)</label>
                          <input
                            type="number"
                            value={deathIntervalSeconds}
                            onChange={(e) => setDeathIntervalSeconds(e.target.value)}
                            placeholder="เช่น 20 (ตายห่างกันไม่เกิน 20 วินาที)"
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1D8B75]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">อัตราเกิดการสั่งเคลื่อนที่และพุ่งทิศทางขัดแย้งกัน (Ratio)</label>
                          <input
                            type="number"
                            step="0.05"
                            value={conflictingDashMoveRatio}
                            onChange={(e) => setConflictingDashMoveRatio(e.target.value)}
                            placeholder="เช่น 0.8 (สั่งลุยปะทะสั่งถอยทับซ้อนกัน 80%)"
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1D8B75]"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Generic Corporate Constraints */}
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">ความขัดแย้งสะสมของพนักงานในทีม (คะแนนความต่าง)</label>
                          <input
                            type="number"
                            value={goldDiffLimit}
                            onChange={(e) => setGoldDiffLimit(e.target.value)}
                            placeholder="เช่น 1500"
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1D8B75]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">ระยะห่างเฉลี่ยความผูกพันพนักงานในชิ้นงาน (เมตรจำลอง)</label>
                          <input
                            type="number"
                            value={avgMemberDistance}
                            onChange={(e) => setAvgMemberDistance(e.target.value)}
                            placeholder="เช่น 800"
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1D8B75]"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 3: Voice / Semantic Trigger */}
                {activeWizardStep === 3 && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-xs text-[#1A3A5C] uppercase tracking-wider">ขั้นตอนที่ 3: ระบุชุดคำศัพท์และระดับเสียงระมัดระวัง</h4>
                    
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">คำศัพท์แท็กคีย์เวิร์ดที่ต้องการดักจับ (คั่นด้วยจุลภาค `,`)</label>
                      <input
                        type="text"
                        value={voiceKeywords}
                        onChange={(e) => setVoiceKeywords(e.target.value)}
                        placeholder="เช่น เลือดน้อย, ตามได้, ช่วยด้วย, ไม่ทัน, ไหวป่าว"
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1D8B75]"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-bold text-gray-700">เกณฑ์เฝ้าระวังดัชนีความตึงเครียดน้ำเสียง (VVI Threshold)</label>
                        <span className="text-xs font-extrabold text-[#1D8B75]">{vviThreshold.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="5.0"
                        step="0.1"
                        value={vviThreshold}
                        onChange={(e) => setVviThreshold(Number(e.target.value))}
                        className="w-full accent-[#1D8B75]"
                      />
                      <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                        <span>1.0 (น้ำเสียงสงบนิ่ง)</span>
                        <span>3.0 (เริ่มตื่นตัว)</span>
                        <span>5.0 (ตื่นตระหนกสูง/Tilt)</span>
                      </div>
                    </div>

                    <div className="pt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={silentTiltEnabled}
                          onChange={(e) => setSilentTiltEnabled(e.target.checked)}
                          className="w-4 h-4 rounded accent-[#1D8B75]"
                        />
                        <div className="text-xs font-bold text-gray-700">เปิดใช้งานตรวจจับสภาวะเสียงเงียบผิดปกติคอลทีม (Silent Tilt)</div>
                      </label>
                      <p className="text-[10px] text-gray-400 mt-1 pl-6">
                        ดักจับเมื่อตรวจพบการงดคุยและสื่อสารกะทันหันขณะข้อมูลเกมบ่งชี้สถานการณ์ตึงเครียด
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">ระยะเวลาพบพนักงานคอลสั่งการทับซ้อนขัดแย้งกัน (วินาที)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={concurrentConflictSeconds}
                        onChange={(e) => setConcurrentConflictSeconds(e.target.value)}
                        placeholder="เช่น 1.0 (ดักคำพูด 'สู้' ปะทะ 'ถอย' พร้อมกันใน 1 วินาที)"
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1D8B75]"
                      />
                    </div>
                  </div>
                )}

                {/* STEP 4: Strategy Recommendations & Macros */}
                {activeWizardStep === 4 && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-xs text-[#1A3A5C] uppercase tracking-wider">ขั้นตอนที่ 4: ใบสั่งงาน AI และ Macro คำสั่งด่วน</h4>
                    
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">เนื้อหาคำแนะนำและยุทธวิธีของ AI (AI Action Recommendation Script)</label>
                      <textarea
                        value={aiOutputMacroScript}
                        onChange={(e) => setAiOutputMacroScript(e.target.value)}
                        placeholder="กรอกปุ่มลัดสั่งการเรืองแสง และข้อความที่ต้องการให้ AI แจ้งเตือนโค้ช..."
                        rows={5}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1D8B75] font-sans"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">
                        ข้อแนะนำ: เขียนข้อความแบบ `[🔘 คำสั่งบนปุ่มด่วน] | คำอธิบายยุทธศาสตร์เสริมเชิงบวก` 
                        ปุ่มนี้จะส่องแสงวาบบนจอโค้ช/ผู้บริหารหน้างานเมื่อเกิดสถานการณ์วิกฤตนี้ขึ้นจริงทันที
                      </p>
                    </div>
                  </div>
                )}

              </div>

              {/* Drawer Footer Actions */}
              <div className="border-t pt-4 mt-6 flex justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setActiveWizardStep(prev => Math.max(1, prev - 1))}
                  disabled={activeWizardStep === 1}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold hover:bg-gray-50 transition-colors disabled:opacity-40"
                >
                  ก่อนหน้า
                </button>

                {activeWizardStep < 4 ? (
                  <button
                    type="button"
                    onClick={() => setActiveWizardStep(prev => Math.min(4, prev + 1))}
                    className="px-4 py-2 bg-[#1A3A5C] text-white rounded-xl text-xs font-bold hover:bg-[#2E75B6] transition-colors"
                  >
                    ถัดไป
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSaveScenario}
                    disabled={isSavingScenario}
                    className="px-5 py-2 bg-[#1D8B75] text-white rounded-xl text-xs font-bold hover:bg-[#156E5C] transition-colors disabled:opacity-40"
                  >
                    {isSavingScenario ? 'กำลังบันทึก...' : '💾 บันทึกแผนกลยุทธ์'}
                  </button>
                )}
              </div>

            </div>
          </div>
        )}

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
                    {userRole !== 'coach' && (
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
                    )}
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

      {/* 🔒 Zero-Trust Security Lock Screen Overlay */}
      {isLocked && userRole !== 'coach' && (
        <div className="fixed inset-0 bg-[#030712]/95 backdrop-blur-xl z-[300] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#0b0f19] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-8 text-center space-y-6 animate-fade-in">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-tr from-rose-600/10 to-indigo-600/10 border border-slate-800/80 flex items-center justify-center text-4xl shadow-inner relative">
              <div className="absolute inset-0 rounded-full bg-rose-500/5 animate-pulse" />
              🛡️
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl font-black text-white tracking-wide">ระบบความปลอดภัย Zero-Trust</h2>
              <p className="text-xs text-slate-400">กรุณายืนยันตัวตนระดับบริหารเพื่อปลดล็อกสิทธิ์การเข้าถึงแดชบอร์ด</p>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 text-left text-[11.5px] text-slate-400 leading-relaxed space-y-1.5">
              <span className="font-bold text-teal-400 flex items-center gap-1.5">
                🛡️ การคุ้มครองข้อมูลส่วนบุคคล (PDPA) & นโยบายความมั่นคงปลอดภัย
              </span>
              <p>
                ในการเข้าถึงระบบนี้ ระบบจะทำการประมวลผลข้อมูลส่วนบุคคลด้านสุขภาพ จิตวิทยา และบันทึกกิจกรรมความปลอดภัยนิติวิทยาศาสตร์ (Audit Logs รวมถึงการพิมพ์ คัดลอก และสลับหน้าต่างทำงาน) ด้วยลายเซ็นดิจิทัลเข้ารหัสที่ไม่สามารถปฏิเสธความรับผิดชอบได้ (Non-repudiation) ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล
              </p>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-semibold text-left">
                ⚠️ {authError}
              </div>
            )}

            {!showOtpFallback ? (
              <div className="space-y-4">
                <button
                  onClick={handlePasskeyUnlock}
                  className="w-full py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
                >
                  <span>🔑</span> สแกน Passkey (Face ID/Fingerprint)
                </button>
                <div className="text-xs text-slate-500 border-t border-slate-800/80 pt-4 flex items-center justify-between">
                  <span>ไม่มีอุปกรณ์ Passkey?</span>
                  <button 
                    onClick={() => {
                      setShowOtpFallback(true);
                      setAuthError(null);
                    }}
                    className="text-indigo-400 hover:underline font-bold"
                  >
                    ใช้รหัสยืนยัน Email OTP ✉️
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-left">
                {!otpSent ? (
                  <div className="space-y-3">
                    <div className="text-left space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">อีเมลสำหรับรับรหัส OTP</label>
                      <input
                        type="text"
                        value={localStorage.getItem('kruth_admin_email') || ''}
                        disabled
                        className="w-full bg-slate-900 border border-slate-800 text-slate-400 px-3.5 py-2.5 rounded-xl text-xs outline-none"
                      />
                    </div>
                    <button
                      onClick={handleRequestOtp}
                      disabled={otpLoading}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-colors disabled:bg-slate-850"
                    >
                      {otpLoading ? 'กำลังส่งรหัส...' : '✉️ ส่งรหัส OTP ไปยังอีเมล'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-left space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">กรอกรหัสยืนยัน 6 หลัก</label>
                        {/* Dev OTP code display removed — real email OTP is now used */}
                      </div>
                      <input
                        type="text"
                        maxLength={6}
                        value={enteredOtp}
                        onChange={e => setEnteredOtp(e.target.value.replace(/\D/g, ''))}
                        placeholder="••••••"
                        className="w-full bg-slate-900 border border-slate-800 text-slate-100 text-center tracking-widest text-lg font-bold px-3.5 py-2.5 rounded-xl outline-none focus:border-indigo-500"
                      />
                    </div>
                    <button
                      onClick={handleVerifyOtp}
                      disabled={otpLoading || enteredOtp.length !== 6}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-colors disabled:bg-slate-850"
                    >
                      {otpLoading ? 'กำลังตรวจสอบ...' : '🔓 ปลดล็อกระบบ'}
                    </button>
                    
                    <div className="flex justify-between items-center text-[10px] text-slate-500 pt-2">
                      <button 
                        onClick={handleRequestOtp}
                        className="hover:underline text-indigo-400 font-semibold"
                      >
                        ขอรหัส OTP อีกครั้ง
                      </button>
                      <span>เหลือโอกาสกรอกอีก {3 - otpAttempts} ครั้ง</span>
                    </div>
                  </div>
                )}
                
                <div className="border-t border-slate-800/80 pt-4 flex items-center justify-start">
                  <button 
                    onClick={() => {
                      setShowOtpFallback(false);
                      setOtpSent(false);
                      setAuthError(null);
                    }}
                    className="text-slate-500 hover:text-slate-400 text-xs font-semibold flex items-center gap-1"
                  >
                    ← กลับไปใช้ Passkey
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      </div>
    </SecurityWatermarkWrapper>
  );
}