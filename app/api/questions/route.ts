import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const band = req.nextUrl.searchParams.get('band');
  if (!band) return NextResponse.json({ error: 'band required' }, { status: 400 });

  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('band', band)
    .eq('session', 'S1')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const questions = (data || []).map((row: any) => ({
    q_id: row.id,
    section: row.section || '',
    dimension: row.dimension || '',
    question: row.question_th || '',
    choices: { A: row.choice_a || '', B: row.choice_b || '', C: row.choice_c || '', D: row.choice_d || '' },
    scores: { A: row.score_a || '', B: row.score_b || '', C: row.score_c || '', D: row.score_d || '' },
    display_mode: row.display_mode || '4choice',
    alert_flag: row.alert_flag || '',
    branch_trigger: row.branch_trigger || 'ALWAYS',
    branch_group: row.branch_group || '',
  }));

  return NextResponse.json(questions);
}
