import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const cookieStore = cookies();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    let rpID = 'localhost';
    try {
      rpID = new URL(appUrl).hostname;
    } catch {
      // fallback
    }

    if (action === 'generate-registration-options') {
      // 1. Get user email/name from database
      let fullName = 'Admin';
      const { data: user, error: uErr } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle();

      if (user) {
        fullName = user.full_name;
      } else {
        // Fallback: check org_admins table by ID
        const { data: admin, error: aErr } = await supabase
          .from('org_admins')
          .select('full_name, email')
          .eq('id', userId)
          .maybeSingle();

        if (admin) {
          fullName = admin.full_name || admin.email;
        } else {
          // Fallback 2: check org_admins by email string (if userId is email)
          const { data: adminByEmail } = await supabase
            .from('org_admins')
            .select('full_name, email')
            .eq('email', userId)
            .maybeSingle();

          if (adminByEmail) {
            fullName = adminByEmail.full_name || adminByEmail.email;
          } else {
            console.error('[WebAuthn Registration] User not found for ID/Email:', userId);
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
          }
        }
      }

      // 2. Fetch existing credentials to exclude
      const { data: credentials } = await supabase
        .from('user_passkey_credentials')
        .select('credential_id')
        .eq('user_id', userId);

      const excludeCredentials = (credentials || []).map((cred: any) => ({
        id: cred.credential_id,
        type: 'public-key' as const,
      }));

      // 3. Generate registration options
      const options = await generateRegistrationOptions({
        rpName: 'KRUTH MIND Platform',
        rpID,
        userID: userId,
        userName: fullName,
        userDisplayName: fullName,
        attestationType: 'none',
        excludeCredentials,
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
          authenticatorAttachment: 'cross-platform', // caBLE / Mobile scan
        },
      });

      // 4. Save challenge to cookie (expires in 5 minutes)
      cookieStore.set('webauthn-registration-challenge', options.challenge, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 300,
      });

      return NextResponse.json(options);
    } 
    
    if (action === 'generate-authentication-options') {
      // 1. Fetch saved credentials from database
      const { data: credentials, error: cErr } = await supabase
        .from('user_passkey_credentials')
        .select('credential_id')
        .eq('user_id', userId);

      if (cErr || !credentials || credentials.length === 0) {
        return NextResponse.json({ error: 'No registered credentials found for user. Please register passkey first.' }, { status: 400 });
      }

      const allowCredentials = credentials.map((cred: any) => ({
        id: cred.credential_id,
        type: 'public-key' as const,
      }));

      // 2. Generate authentication options
      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials,
        userVerification: 'preferred',
      });

      // 3. Save challenge to cookie (expires in 5 minutes)
      cookieStore.set('webauthn-authentication-challenge', options.challenge, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 300,
      });

      return NextResponse.json(options);
    }

    return NextResponse.json({ error: 'Invalid GET action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, userId, response } = body;

    if (!userId || !response) {
      return NextResponse.json({ error: 'userId and response are required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const cookieStore = cookies();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    let rpID = 'localhost';
    let expectedOrigin = 'http://localhost:3000';
    try {
      const parsedUrl = new URL(appUrl);
      rpID = parsedUrl.hostname;
      expectedOrigin = parsedUrl.origin;
    } catch {
      // fallback
    }

    if (action === 'verify-registration') {
      const expectedChallenge = cookieStore.get('webauthn-registration-challenge')?.value;
      if (!expectedChallenge) {
        return NextResponse.json({ error: 'Challenge expired or not found' }, { status: 400 });
      }

      // Verify the response
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin,
        expectedRPID: rpID,
      });

      const { verified, registrationInfo } = verification;

      if (verified && registrationInfo) {
        const { credentialID, credentialPublicKey, counter } = registrationInfo;

        // Save new credential to database
        const base64PublicKey = Buffer.from(credentialPublicKey).toString('base64');
        
        const { error: insertErr } = await supabase
          .from('user_passkey_credentials')
          .insert({
            user_id: userId,
            credential_id: Buffer.from(credentialID).toString('base64url'),
            public_key: base64PublicKey,
            counter,
            device_name: response.authenticatorAttachment || 'Unknown Device',
          });

        if (insertErr) {
          return NextResponse.json({ error: 'Failed to save credential: ' + insertErr.message }, { status: 500 });
        }

        // Clear challenge cookie
        cookieStore.delete('webauthn-registration-challenge');

        return NextResponse.json({ verified: true });
      }

      return NextResponse.json({ verified: false, error: 'Verification failed' }, { status: 400 });
    }

    if (action === 'verify-authentication') {
      const expectedChallenge = cookieStore.get('webauthn-authentication-challenge')?.value;
      if (!expectedChallenge) {
        return NextResponse.json({ error: 'Challenge expired or not found' }, { status: 400 });
      }

      // 1. Fetch saved credential matching credential.id
      const credentialIdB64url = response.id;
      const { data: dbCredential, error: credErr } = await supabase
        .from('user_passkey_credentials')
        .select('*')
        .eq('credential_id', credentialIdB64url)
        .eq('user_id', userId)
        .single();

      if (credErr || !dbCredential) {
        return NextResponse.json({ error: 'Credential not found in database' }, { status: 400 });
      }

      const publicKeyBuffer = Buffer.from(dbCredential.public_key, 'base64');

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin,
        expectedRPID: rpID,
        authenticator: {
          credentialID: Buffer.from(dbCredential.credential_id, 'base64url'),
          credentialPublicKey: new Uint8Array(publicKeyBuffer),
          counter: dbCredential.counter,
        },
      });

      const { verified, authenticationInfo } = verification;

      if (verified && authenticationInfo) {
        // 3. Update counter in database
        const { error: updateErr } = await supabase
          .from('user_passkey_credentials')
          .update({ counter: authenticationInfo.newCounter })
          .eq('id', dbCredential.id);

        if (updateErr) {
          console.error('Failed to update counter:', updateErr.message);
        }

        // Clear challenge cookie
        cookieStore.delete('webauthn-authentication-challenge');

        return NextResponse.json({ verified: true });
      }

      return NextResponse.json({ verified: false, error: 'Verification failed' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Invalid POST action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
