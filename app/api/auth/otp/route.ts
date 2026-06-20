import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, email, otp, enteredOtp } = body;

    const cookieStore = cookies();

    if (action === 'send') {
      if (!email) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
      }

      // Generate a 6-digit random code
      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

      // Store in an HTTP-only cookie (expires in 5 minutes)
      cookieStore.set('email-otp-code', generatedOtp, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 300,
      });
      cookieStore.set('email-otp-email', email, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 300,
      });
      cookieStore.set('email-otp-attempts', '0', {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 300,
      });

      console.log(`[DEV OTP] Sent OTP code ${generatedOtp} to ${email}`);

      return NextResponse.json({ 
        success: true, 
        message: `ส่งรหัส OTP ไปยังอีเมล ${email} เรียบร้อยแล้ว (สุ่มสำหรับจำลอง)`,
        // In dev mode, return the OTP so the tester doesn't have to check console logs
        devOtp: generatedOtp 
      });
    }

    if (action === 'verify') {
      if (!enteredOtp) {
        return NextResponse.json({ error: 'OTP code is required' }, { status: 400 });
      }

      const storedOtp = cookieStore.get('email-otp-code')?.value;
      const attemptsStr = cookieStore.get('email-otp-attempts')?.value || '0';
      let attempts = parseInt(attemptsStr, 10);

      if (!storedOtp) {
        return NextResponse.json({ error: 'รหัส OTP หมดอายุหรือยังไม่ได้ส่งรหัส' }, { status: 400 });
      }

      if (attempts >= 3) {
        return NextResponse.json({ error: 'คุณกรอกรหัสผิดเกิน 3 ครั้ง ระบบได้ล็อกเซสชันชั่วคราว' }, { status: 429 });
      }

      if (enteredOtp === storedOtp) {
        // Verification succeeded, clear cookies
        cookieStore.delete('email-otp-code');
        cookieStore.delete('email-otp-email');
        cookieStore.delete('email-otp-attempts');
        return NextResponse.json({ verified: true });
      } else {
        attempts += 1;
        cookieStore.set('email-otp-attempts', attempts.toString(), {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: 300,
        });

        if (attempts >= 3) {
          return NextResponse.json({ 
            verified: false, 
            attempts,
            error: 'คุณกรอกรหัสผิดครบ 3 ครั้งแล้ว กรุณากดขอรหัสใหม่' 
          }, { status: 400 });
        }

        return NextResponse.json({ 
          verified: false, 
          attempts,
          error: `รหัส OTP ไม่ถูกต้อง (เหลือโอกาสอีก ${3 - attempts} ครั้ง)` 
        }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
