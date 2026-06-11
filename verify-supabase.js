/**
 * KRUTH DEMM — ตรวจสอบ cross-dim tags ใน Supabase
 * 
 * npm install @supabase/supabase-js
 * node verify-supabase.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bruyuwjuewpuntcoeoqe.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BBTO8qP4euOGWHnrJGIsPA_dEfEVGPG';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('═══ KRUTH DEMM — Supabase Verification ═══\n');

  // 1. Check questions
  const { data: qs, error: qErr } = await supabase.from('questions').select('*').eq('band', 'E');
  if (qErr) { console.error('Questions error:', qErr.message); return; }
  
  console.log(`Questions (Band E): ${qs.length}`);
  
  let cross = 0;
  let total = 0;
  for (const q of qs) {
    total++;
    for (const field of ['score_a', 'score_b', 'score_c', 'score_d']) {
      const tag = q[field] || '';
      const dims = new Set();
      for (const part of tag.split('|')) {
        const m = part.match(/^([OCEAN]):/);
        if (m) dims.add(m[1]);
      }
      if (dims.size >= 2) cross++;
    }
  }
  console.log(`Cross-dimension answers: ${cross}`);
  console.log(`Status: ${cross > 0 ? '✅ มี cross-dim' : '❌ ไม่มี cross-dim — ต้อง re-import!'}\n`);

  // 2. Check archetypes
  const { data: arcs } = await supabase.from('archetypes').select('id, is_active').eq('is_active', true);
  console.log(`Active Archetypes: ${arcs?.length || 0}/96`);

  // 3. Check name_numerology
  const { data: nums } = await supabase.from('name_numerology').select('id');
  console.log(`Name Numerology: ${nums?.length || 0}/83`);

  // 4. Check locations
  const { data: locs } = await supabase.from('locations').select('id');
  console.log(`Locations: ${locs?.length || 0}/77`);

  // 5. Sample question with cross-dim
  console.log('\nSample questions:');
  for (const q of qs.slice(0, 3)) {
    console.log(`  ${q.id}: A=${q.score_a} | B=${q.score_b}`);
  }
}

main().catch(console.error);
