import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, password } = body;

    if (!token || !password) {
      return NextResponse.json({ error: 'ข้อมูลไม่ครบถ้วน: กรุณากรอกรหัสผ่านและโทเค็น' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
    }

    // 1. Find the admin with the given password_setup_token
    const { data: adminData, error: dbErr } = await supabase
      .from('org_admins')
      .select('id, email')
      .eq('password_setup_token', token)
      .maybeSingle();

    if (dbErr) {
      console.error('[Auth Setup Password] Database error:', dbErr);
      return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบโทเค็น' }, { status: 500 });
    }

    if (!adminData) {
      return NextResponse.json({ error: 'ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง หรืออาจเคยถูกใช้งานไปแล้ว' }, { status: 400 });
    }

    // 2. Generate secure PBKDF2 salt & hash
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');

    // 3. Update org_admins record
    const { error: updateErr } = await supabase
      .from('org_admins')
      .update({
        password_hash: hash,
        password_salt: salt,
        password_setup_token: null // Invalidate token once used
      })
      .eq('id', adminData.id);

    if (updateErr) {
      console.error('[Auth Setup Password] Update error:', updateErr);
      return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการบันทึกรหัสผ่าน' }, { status: 500 });
    }

    console.log(`[Auth Setup Password] Successfully setup password for admin email: ${adminData.email}`);
    return NextResponse.json({
      success: true,
      message: 'ตั้งค่ารหัสผ่านสำเร็จเรียบร้อยแล้ว ท่านสามารถเข้าใช้ระบบได้ทันที'
    });

  } catch (error: any) {
    console.error('[Auth Setup Password] Exception:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
