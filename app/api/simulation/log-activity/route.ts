import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');
    const userId = searchParams.get('user_id');

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    let query = supabase.from('member_activity_evaluations').select('*').eq('session_id', sessionId);
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { session_id, user_id, evaluator_id, activity_name, performance_rating, qualitative_notes } = body;

    if (!session_id || !user_id || !evaluator_id || !activity_name) {
      return NextResponse.json(
        { error: 'Missing required fields: session_id, user_id, evaluator_id, activity_name' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('member_activity_evaluations')
      .insert({
        session_id,
        user_id,
        evaluator_id,
        activity_name,
        performance_rating: Number(performance_rating),
        qualitative_notes: qualitative_notes || null
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
