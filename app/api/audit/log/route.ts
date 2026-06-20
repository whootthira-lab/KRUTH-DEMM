import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const hmacSecret = process.env.HMAC_SECRET || 'kruth-mind-forensic-default-salt-2026';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { executive_id, org_id, target_member_id, access_granted_to = 'INDIVIDUAL_WELLBEING_PANEL' } = body;

    if (!executive_id || !org_id) {
      return NextResponse.json(
        { error: 'Missing required fields: executive_id, org_id' },
        { status: 400 }
      );
    }

    // 1. Get client network metadata
    const ipAddress = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Unknown Browser';

    // 2. Generate HMAC-SHA256 Signature for Non-Repudiation Audit Trail
    const signatureInput = `${executive_id}:${org_id}:${target_member_id || ''}:${access_granted_to}:${ipAddress}:${userAgent}`;
    const digitalSignatureHash = createHmac('sha256', hmacSecret)
      .update(signatureInput)
      .digest('hex');

    // 3. Save to database
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error: insertErr } = await supabase
      .from('executive_privacy_audit_logs')
      .insert({
        executive_id,
        org_id,
        target_member_id,
        access_granted_to,
        ip_address: ipAddress,
        user_agent: userAgent,
        digital_signature_hash: digitalSignatureHash
      });

    if (insertErr) {
      return NextResponse.json(
        { error: 'Failed to write audit log: ' + insertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, signature: digitalSignatureHash });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
