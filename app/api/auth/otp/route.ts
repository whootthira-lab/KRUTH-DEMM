import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

// Use anon key — signInWithOtp works with anon key on server-side
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, email, enteredOtp } = body;

    const cookieStore = cookies();

    // ─── ACTION: SEND OTP ──────────────────────────────────────────
    if (action === 'send') {
      if (!email) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
      }

      // Use Supabase Auth OTP — sends real email via Supabase's email service
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true, // สร้าง auth user ถ้ายังไม่มี
        },
      });

      if (error) {
        console.error('[OTP Send Error]', error.message);
        return NextResponse.json(
          { error: `ไม่สามารถส่งรหัส OTP ได้: ${error.message}` },
          { status: 500 }
        );
      }

      // Store email in cookie so verify step knows which email to check
      cookieStore.set('email-otp-email', email, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
      });
      // Reset attempts counter
      cookieStore.set('email-otp-attempts', '0', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
      });

      console.log(`[Supabase OTP] Real OTP email sent to: ${email}`);

      return NextResponse.json({
        success: true,
        message: `ส่งรหัส OTP ไปยังอีเมล ${email} เรียบร้อยแล้ว กรุณาตรวจสอบกล่องจดหมาย (รหัสหมดอายุใน 10 นาที)`,
      });
    }

    // ─── ACTION: VERIFY OTP ────────────────────────────────────────
    if (action === 'verify') {
      if (!enteredOtp) {
        return NextResponse.json({ error: 'OTP code is required' }, { status: 400 });
      }

      const storedEmail = cookieStore.get('email-otp-email')?.value;
      const attemptsStr = cookieStore.get('email-otp-attempts')?.value || '0';
      let attempts = parseInt(attemptsStr, 10);

      if (!storedEmail) {
        return NextResponse.json(
          { error: 'เซสชัน OTP หมดอายุ กรุณากดขอรหัสใหม่' },
          { status: 400 }
        );
      }

      if (attempts >= 5) {
        return NextResponse.json(
          { error: 'คุณกรอกรหัสผิดเกิน 5 ครั้ง กรุณากดขอรหัสใหม่' },
          { status: 429 }
        );
      }

      // Verify with Supabase Auth
      const { data, error } = await supabase.auth.verifyOtp({
        email: storedEmail,
        token: enteredOtp.trim(),
        type: 'email',
      });

      if (error || !data.session) {
        attempts += 1;
        cookieStore.set('email-otp-attempts', attempts.toString(), {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 600,
        });

        const remaining = 5 - attempts;
        if (attempts >= 5) {
          // Clear session so they must request new OTP
          cookieStore.delete('email-otp-email');
          cookieStore.delete('email-otp-attempts');
          return NextResponse.json(
            {
              verified: false,
              attempts,
              error: 'คุณกรอกรหัสผิดครบ 5 ครั้งแล้ว กรุณากดขอรหัสใหม่',
            },
            { status: 400 }
          );
        }

        return NextResponse.json(
          {
            verified: false,
            attempts,
            error: `รหัส OTP ไม่ถูกต้อง (เหลือโอกาสอีก ${remaining} ครั้ง)`,
          },
          { status: 400 }
        );
      }

      // ✅ Verified successfully — clear session cookies
      cookieStore.delete('email-otp-email');
      cookieStore.delete('email-otp-attempts');

      console.log(`[Supabase OTP] Verified successfully for: ${storedEmail}`);

      return NextResponse.json({ verified: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('[OTP Route Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
