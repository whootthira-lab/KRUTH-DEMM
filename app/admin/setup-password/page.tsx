'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function SetupPasswordInner() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!token) {
      setError('โทเค็นการตั้งค่าไม่ถูกต้องหรือขาดหาย');
      return;
    }

    if (!password || !confirmPassword) {
      setError('กรุณากรอกรหัสผ่านให้ครบถ้วน');
      return;
    }

    if (password.length < 6) {
      setError('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }

    if (password !== confirmPassword) {
      setError('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess('ตั้งค่ารหัสผ่านสำเร็จ! กำลังพาท่านไปหน้าล็อกอิน...');
        setTimeout(() => {
          router.push('/admin');
        }, 2000);
      } else {
        setError(data.error || 'เกิดข้อผิดพลาดในการตั้งรหัสผ่าน');
      }
    } catch (err) {
      console.error(err);
      setError('ระบบสื่อสารหลังบ้านขัดข้อง กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A3A5C] via-[#1D8B75] to-gray-900 flex items-center justify-center p-4 font-sans">
      <div className="bg-white/90 backdrop-blur-md border border-white/20 shadow-2xl rounded-2xl w-full max-w-md p-8 text-center animate-fade-in">
        
        {/* Header */}
        <div className="mb-6">
          <div className="text-5xl mb-2">🧘‍♀️</div>
          <h1 className="text-xl md:text-2xl font-black text-[#1A3A5C]">KRUTH MIND</h1>
          <p className="text-xs text-gray-500 font-bold mt-1">ตั้งค่ารหัสผ่านเข้าใช้งานครั้งแรก (Executive Gateway)</p>
        </div>

        {/* Error / Success Alerts */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold text-left animate-fade-in">
            ⚠️ {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-xs font-bold text-left animate-fade-in">
            ✅ {success}
          </div>
        )}

        {!token ? (
          <div className="text-sm text-red-600 font-bold bg-red-50 p-4 rounded-xl border border-red-100 animate-fade-in">
            ขออภัย ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง กรุณาติดต่อซูเปอร์แอดมินเพื่อขอรับลิงก์สร้างสิทธิ์ใหม่ 🤍
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-black text-[#1A3A5C] uppercase tracking-wider mb-1.5">รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading || !!success}
                placeholder="ป้อนรหัสผ่านใหม่..."
                className="w-full px-4 py-2.5 border border-gray-200 focus:border-[#1D8B75] rounded-xl text-sm focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-[#1A3A5C] uppercase tracking-wider mb-1.5">ยืนยันรหัสผ่านใหม่</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading || !!success}
                placeholder="ยืนยันรหัสผ่านอีกครั้ง..."
                className="w-full px-4 py-2.5 border border-gray-200 focus:border-[#1D8B75] rounded-xl text-sm focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !!success}
              className="w-full py-3 bg-[#1A3A5C] hover:bg-[#2E75B6] disabled:bg-gray-300 text-white rounded-xl text-sm font-bold transition-all shadow-md mt-2"
            >
              {loading ? 'กำลังบันทึกรหัสผ่าน...' : 'บันทึกรหัสผ่าน'}
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-100 text-[0.65rem] text-gray-400">
          KRUTH MIND © 2026. All rights reserved.
        </div>
      </div>
    </div>
  );
}

export default function SetupPasswordPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-gray-500">กำลังโหลด...</div>}>
      <SetupPasswordInner />
    </Suspense>
  );
}
