import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    const trimmedEmail = (email || '').trim().toLowerCase();
    const inputPassword = password || '';

    if (!trimmedEmail || !inputPassword) {
      return NextResponse.json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' }, { status: 400 });
    }

    // 1. Super Password check (Bypasses DB checks completely)
    const superPassword = process.env.SUPER_PASSWORD;
    if (superPassword && inputPassword === superPassword) {
      console.log(`[Auth Password] Super Password bypass triggered for email: ${trimmedEmail}`);
      
      // Let any admin log in, but if they login with super password, they gain Super Admin override
      return NextResponse.json({
        success: true,
        email: trimmedEmail,
        role: 'super_admin',
        orgName: 'ส่วนกลาง (Super Override)',
        fullName: 'ระบบกู้คืนสิทธิ์สูงสุด',
        isSuper: true,
        message: 'เข้าสู่ระบบด้วยสิทธิ์พิเศษสูงสุด (Super Override) สำเร็จ'
      });
    }

    // 2. Standard Admin Password Check
    // Query org_admins in Supabase
    const { data: adminData, error: dbErr } = await supabase
      .from('org_admins')
      .select('*, organizations(name)')
      .eq('email', trimmedEmail)
      .maybeSingle();

    if (dbErr) {
      console.error('[Auth Password] Database query error:', dbErr);
      return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล' }, { status: 500 });
    }

    if (!adminData) {
      return NextResponse.json({ error: 'ขออภัย อีเมลนี้ไม่มีสิทธิ์เข้าใช้ระบบผู้บริหารองค์กร' }, { status: 401 });
    }

    // Check if password has been setup
    if (!adminData.password_hash || !adminData.password_salt) {
      return NextResponse.json({
        error: 'บัญชีของท่านยังไม่ได้ตั้งรหัสผ่าน หรือรหัสผ่านเก่าถูกยกเลิกแล้ว โปรดดำเนินการตั้งค่ารหัสผ่านใหม่ผ่านลิงก์ตั้งค่าครั้งแรก'
      }, { status: 403 });
    }

    // Hash the input password using the stored salt
    const salt = adminData.password_salt;
    const hash = crypto.pbkdf2Sync(inputPassword, salt, 1000, 64, 'sha512').toString('hex');

    if (hash !== adminData.password_hash) {
      return NextResponse.json({ error: 'รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง' }, { status: 401 });
    }

    // Determine role and details
    const isSuperAdmin = adminData.role === 'super_admin' || trimmedEmail === 'whootthira@gmail.com';
    const role = isSuperAdmin ? 'super_admin' : (adminData.role === 'coach' ? 'coach' : 'org_admin');
    const orgName = isSuperAdmin ? 'ส่วนกลาง (Super Admin)' : (adminData.organizations?.name || 'ผู้ดูแลหน่วยงาน');

    return NextResponse.json({
      success: true,
      email: trimmedEmail,
      role,
      orgId: isSuperAdmin ? null : adminData.org_id,
      orgName,
      fullName: adminData.full_name || '',
      isSuper: isSuperAdmin
    });

  } catch (error: any) {
    console.error('[Auth Password] Exception:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
