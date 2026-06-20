import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { optimizeGroup, SimProfile } from '@/lib/scoring';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { org_id, project_type, group_size, forced_user_ids = [] } = body;

    if (!org_id || !project_type || !group_size) {
      return NextResponse.json(
        { error: 'Missing required fields: org_id, project_type, group_size' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch organization members
    const { data: mData, error: mErr } = await supabase
      .from('org_members')
      .select(`
        user_id,
        users:user_id (
          id,
          full_name,
          gender,
          thai_element,
          chinese_element
        )
      `)
      .eq('org_id', org_id);

    if (mErr) {
      return NextResponse.json({ error: mErr.message }, { status: 500 });
    }

    if (!mData || mData.length === 0) {
      return NextResponse.json({ members: [] });
    }

    const userIds = mData.map((m: any) => m.user_id);

    // 2. Fetch latest results
    const { data: rData, error: rErr } = await supabase
      .from('results')
      .select(`
        user_id,
        score_o,
        score_c,
        score_e,
        score_a,
        score_n,
        quadrant_primary,
        via_dominant,
        via_scores,
        jungian_type,
        jungian_scores
      `)
      .in('user_id', userIds)
      .order('created_at', { ascending: false });

    if (rErr) {
      return NextResponse.json({ error: rErr.message }, { status: 500 });
    }

    // 3. Fetch KWI responses
    const { data: kData, error: kErr } = await supabase
      .from('kwi_responses')
      .select('user_id, vitality, meaning, connection, mastery, resilience')
      .in('user_id', userIds)
      .order('taken_at', { ascending: false });

    if (kErr) {
      return NextResponse.json({ error: kErr.message }, { status: 500 });
    }

    // 4. Map to latest result per user
    const latestResults: Record<string, any> = {};
    if (rData) {
      rData.forEach(r => {
        if (!latestResults[r.user_id]) {
          latestResults[r.user_id] = r;
        }
      });
    }

    const latestKwi: Record<string, any> = {};
    if (kData) {
      kData.forEach(k => {
        if (!latestKwi[k.user_id]) {
          latestKwi[k.user_id] = k;
        }
      });
    }

    // 5. Construct pool
    const pool: SimProfile[] = mData.map((m: any) => {
      const uid = m.user_id;
      const u = m.users;
      const r = latestResults[uid];
      const k = latestKwi[uid];

      const parseJson = (field: any) => {
        if (typeof field === 'string') {
          try { return JSON.parse(field); } catch { return {}; }
        }
        return field || {};
      };

      const viaScores = r ? parseJson(r.via_scores) : {};
      const jungianScores = r ? parseJson(r.jungian_scores) : {};

      // Calculate delta_tilt mock from name elements if not present
      const nameFire = u?.name_fire_pct || 0.0;
      const angerMock = Math.max(0.0, Math.min(5.0, nameFire / 20.0));
      const aggressionMock = Math.max(0.0, Math.min(5.0, (u?.full_name?.length || 5) / 4.0));

      return {
        user_id: uid,
        full_name: u?.full_name || 'ไม่พบชื่อ',
        gender: u?.gender,
        thai_element: u?.thai_element,
        chinese_element: u?.chinese_element,
        score_o: r?.score_o ?? 3.0,
        score_c: r?.score_c ?? 3.0,
        score_e: r?.score_e ?? 3.0,
        score_a: r?.score_a ?? 3.0,
        score_n: r?.score_n ?? 3.0,
        quadrant_primary: r?.quadrant_primary || 'Q1',
        jungian_type: r?.jungian_type || 'TJ',
        via_dominant: r?.via_dominant || '',
        via_scores: {
          W: viaScores.Wisdom || viaScores.W || 3.0,
          C: viaScores.Courage || viaScores.C || 3.0,
          H: viaScores.Humanity || viaScores.H || 3.0,
          J: viaScores.Justice || viaScores.J || 3.0,
          T: viaScores.Temperance || viaScores.T || 3.0,
          Tr: viaScores.Transcendence || viaScores.Tr || 3.0
        },
        kwi: k ? {
          vitality: k.vitality,
          meaning: k.meaning,
          connection: k.connection,
          mastery: k.mastery,
          resilience: k.resilience
        } : {
          vitality: 3.0,
          meaning: 3.0,
          connection: 3.0,
          mastery: 3.0,
          resilience: 3.0
        },
        delta_tilt: {
          anger: angerMock,
          aggression: aggressionMock
        }
      };
    });

    // 6. Run AI Optimization Engine
    const optimized = optimizeGroup(pool, Number(group_size), project_type, forced_user_ids);

    return NextResponse.json({ members: optimized });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
