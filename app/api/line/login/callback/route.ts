import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  
  try {
    const code = req.nextUrl.searchParams.get('code');
    const state = req.nextUrl.searchParams.get('state'); // This contains the user_id (DEM-...)
    const error = req.nextUrl.searchParams.get('error');
    const errorDesc = req.nextUrl.searchParams.get('error_description');

    if (error) {
      console.warn(`[LINE Login Callback] Authorization error: ${error} - ${errorDesc}`);
      return NextResponse.redirect(`${origin}/result/${state || ''}?linked=false&error=${encodeURIComponent(errorDesc || error)}`);
    }

    if (!code || !state) {
      console.error("[LINE Login Callback] Missing authorization code or state (userId).");
      return NextResponse.redirect(`${origin}/?error=missing_params`);
    }

    const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
    const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;

    if (!channelId || !channelSecret) {
      console.error("[LINE Login Callback] LINE Login environment variables are not configured.");
      return NextResponse.redirect(`${origin}/result/${state}?linked=false&error=server_configuration_error`);
    }

    const redirectUri = `${origin}/api/line/login/callback`;

    // 1. Exchange authorization code for access token
    console.log(`[LINE Login Callback] Exchanging code for user ID: ${state}`);
    const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("[LINE Login Callback] Token exchange failed:", errorText);
      return NextResponse.redirect(`${origin}/result/${state}?linked=false&error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error("[LINE Login Callback] Access token not found in response.");
      return NextResponse.redirect(`${origin}/result/${state}?linked=false&error=no_access_token`);
    }

    // 2. Fetch user profile from LINE API
    const profileResponse = await fetch('https://api.line.me/v2/profile', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text();
      console.error("[LINE Login Callback] Profile fetch failed:", errorText);
      return NextResponse.redirect(`${origin}/result/${state}?linked=false&error=profile_fetch_failed`);
    }

    const profileData = await profileResponse.json();
    const lineUserId = profileData.userId;

    if (!lineUserId) {
      console.error("[LINE Login Callback] LINE userId not found in profile.");
      return NextResponse.redirect(`${origin}/result/${state}?linked=false&error=no_line_user_id`);
    }

    console.log(`[LINE Login Callback] Successfully retrieved LINE User ID: ${lineUserId} for user: ${state}`);

    // 3. Verify user in database
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('id', state)
      .maybeSingle();

    if (userErr || !user) {
      console.error(`[LINE Login Callback] User ${state} not found in database:`, userErr);
      return NextResponse.redirect(`${origin}/?error=user_not_found`);
    }

    // 4. Update user's line_user_id in Supabase
    const { error: updateErr } = await supabase
      .from('users')
      .update({ line_user_id: lineUserId })
      .eq('id', state);

    if (updateErr) {
      console.error("[LINE Login Callback] Database update failed:", updateErr.message);
      return NextResponse.redirect(`${origin}/result/${state}?linked=false&error=database_update_failed`);
    }

    // 5. Send automated greeting push message via Messaging API
    const botAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (botAccessToken) {
      try {
        // Fetch user archetype for a personalized welcome message
        const { data: resultData } = await supabase
          .from('results')
          .select('archetype_name_th')
          .eq('user_id', state)
          .maybeSingle();

        const archetypeName = resultData?.archetype_name_th || 'วิเคราะห์จิตวิทยา';
        const welcomeText = `เชื่อมต่อผลประเมินสำเร็จแล้วค่ะ คุณ ${user.full_name || 'ผู้รับการประเมิน'}! ✨\n\nยินดีที่ได้ร่วมทางดูแลสุขภาวะใจของคุณนะคะ โค้ชสะติยะได้รับข้อมูลบุคลิกภาพ (Archetype: ${archetypeName}) ของคุณเรียบร้อยแล้วค่ะ\n\nต่อจากนี้ คุณสามารถพิมพ์เล่าเรื่องราว ปรึกษาปัญหาสุขภาพจิต หรือพูดคุยทั่วไปกับฉันผ่านทางช่องทาง LINE นี้ได้ทันทีเลยนะคะ 🧘‍♀️🤍`;

        await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${botAccessToken}`,
          },
          body: JSON.stringify({
            to: lineUserId,
            messages: [
              {
                type: 'text',
                text: welcomeText,
              },
            ],
          }),
        });
        console.log(`[LINE Login Callback] Sent welcome push notification to ${lineUserId}`);
      } catch (pushErr) {
        console.error("[LINE Login Callback] Failed to send push greeting message:", pushErr);
        // Do not fail the flow if push message fails
      }
    } else {
      console.warn("[LINE Login Callback] LINE_CHANNEL_ACCESS_TOKEN not set, skipping welcome push message.");
    }

    // Redirect to the success screen
    return NextResponse.redirect(`${origin}/result/${state}?linked=true`);
  } catch (error: any) {
    console.error("[LINE Login Callback] Exception:", error);
    return NextResponse.redirect(`${origin}/?error=callback_exception`);
  }
}
