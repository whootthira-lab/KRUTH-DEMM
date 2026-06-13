'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('กรุณากรอกอีเมล');
      return;
    }

    setLoading(true);

    try {
      // 1. Query the org_admins table in Supabase
      const { data: adminData, error: dbErr } = await supabase
        .from('org_admins')
        .select('*, organizations(name)')
        .eq('email', trimmedEmail)
        .maybeSingle();

      if (dbErr) {
        console.error('Database query error:', dbErr);
        setError('เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล');
        setLoading(false);
        return;
      }

      // 2. Check if adminData exists
      if (!adminData) {
        setError('ขออภัย อีเมลนี้ไม่มีสิทธิ์เข้าใช้ระบบผู้บริหารองค์กร');
        setLoading(false);
        return;
      }

      // 3. Determine if it is a Super Admin or Org Admin
      const isSuper = adminData.role === 'super_admin' || trimmedEmail === 'whootthira@gmail.com';
      const role = isSuper ? 'super_admin' : 'org_admin';
      const orgName = isSuper ? 'ส่วนกลาง (Super Admin)' : (adminData.organizations as any)?.name || 'ผู้ดูแลหน่วยงาน';

      // 4. Save admin credentials to localStorage
      localStorage.setItem('kruth_admin_email', trimmedEmail);
      localStorage.setItem('kruth_admin_role', role);
      localStorage.setItem('kruth_admin_org_name', orgName);
      
      if (!isSuper) {
        localStorage.setItem('kruth_admin_org_id', adminData.org_id);
      } else {
        localStorage.removeItem('kruth_admin_org_id'); // Super admin has global scope
      }

      setSuccess(`เข้าสู่ระบบสำเร็จ! ยินดีต้อนรับ ${orgName}`);
      
      // 5. Redirect based on role
      setTimeout(() => {
        if (isSuper) {
          router.push('/admin/super-dashboard');
        } else {
          router.push('/admin/dashboard');
        }
      }, 1500);

    } catch (err: any) {
      console.error('Login error:', err);
      setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A3A5C] via-[#1D8B75] to-gray-900 flex items-center justify-center p-4 font-sans">
      <div className="bg-white/90 backdrop-blur-md border border-white/20 shadow-2xl rounded-2xl w-full max-w-md p-8 text-center">
        
        {/* Header */}
        <div className="mb-6">
          <div className="text-5xl mb-2">🦅</div>
          <h1 className="text-xl md:text-2xl font-black text-[#1A3A5C]">KRUTH MIND</h1>
          <p className="text-xs text-gray-500 font-bold mt-1">ระบบวิเคราะห์ข้อมูลผู้บริหารองค์กร (Executive Gateway)</p>
        </div>

        {/* Info box */}
        <div className="mb-6 p-3 bg-teal-50 border border-teal-100 rounded-xl text-left text-xs leading-relaxed text-teal-800 space-y-1">
          <p>📍 <strong>ระบบตรวจสอบสิทธิ์ผู้บริหารองค์กร:</strong></p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>ล็อกอินด้วย <strong>whootthira@gmail.com</strong> เพื่อเข้าสู่หน้า Super Admin</li>
            <li>ล็อกอินด้วย <strong>dole.dankhunthot@gmail.com</strong> เพื่อเข้าแดชบอร์ด สกร. ด่านขุนทด</li>
          </ul>
        </div>

        {/* Error / Success Alerts */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold animate-fade-in text-left">
            ⚠️ {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-xs font-bold animate-fade-in text-left">
            ✅ {success}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4 text-left">
          <div>
            <label className="block text-xs font-black text-[#1A3A5C] uppercase tracking-wider mb-1.5">อีเมลผู้บริหาร</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              placeholder="example@gmail.com"
              className="w-full px-4 py-2.5 border border-gray-200 focus:border-[#1D8B75] rounded-xl text-sm focus:outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#1A3A5C] hover:bg-[#2E75B6] disabled:bg-gray-300 text-white rounded-xl text-sm font-bold transition-all shadow-md mt-2"
          >
            {loading ? 'กำลังตรวจสอบสิทธิ์...' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-100 text-[0.65rem] text-gray-400">
          KRUTH MIND © 2026. All rights reserved.
        </div>
      </div>
    </div>
  );
}
