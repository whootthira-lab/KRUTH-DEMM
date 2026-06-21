import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
    if (!channelId) {
      console.error("[LINE Login Authorize] LINE_LOGIN_CHANNEL_ID is not configured.");
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Determine base URL dynamically or fallback to NEXT_PUBLIC_APP_URL
    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const redirectUri = `${origin}/api/line/login/callback`;

    // Construct the LINE Login Authorization URL
    // Scope includes 'profile' and 'openid'
    // bot_prompt=normal prompts the user to add the bot as a friend during login
    const authorizeUrl = `https://access.line.me/oauth2/v2.1/authorize` +
      `?response_type=code` +
      `&client_id=${channelId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${userId}` +
      `&scope=profile%20openid` +
      `&bot_prompt=normal`;

    console.log(`[LINE Login Authorize] Redirecting user ${userId} to LINE Login. Redirect URI: ${redirectUri}`);
    return NextResponse.redirect(authorizeUrl);
  } catch (error: any) {
    console.error("[LINE Login Authorize] Exception:", error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
