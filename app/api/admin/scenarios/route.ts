import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');

    if (!orgId) {
      return NextResponse.json({ error: 'Missing org_id' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('custom_scenario_registry')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

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
    const { id, org_id, creator_id, scenario_name, project_type, telemetry_constraints, voice_constraints, ai_output_macro_script, is_active } = body;

    if (!org_id || !creator_id || !scenario_name || !project_type || !ai_output_macro_script) {
      return NextResponse.json(
        { error: 'Missing required fields: org_id, creator_id, scenario_name, project_type, ai_output_macro_script' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    let result;
    if (id) {
      // Update existing
      result = await supabase
        .from('custom_scenario_registry')
        .update({
          scenario_name,
          project_type,
          telemetry_constraints: telemetry_constraints || {},
          voice_constraints: voice_constraints || {},
          ai_output_macro_script,
          is_active: is_active !== undefined ? is_active : true
        })
        .eq('id', id)
        .select()
        .single();
    } else {
      // Insert new
      result = await supabase
        .from('custom_scenario_registry')
        .insert({
          org_id,
          creator_id,
          scenario_name,
          project_type,
          telemetry_constraints: telemetry_constraints || {},
          voice_constraints: voice_constraints || {},
          ai_output_macro_script,
          is_active: is_active !== undefined ? is_active : true
        })
        .select()
        .single();
    }

    const { data, error } = result;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('custom_scenario_registry')
      .delete()
      .eq('id', id)
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
