/**
 * KRUTH DEMM — Import Excel → Supabase
 * 
 * วิธีใช้:
 * 1. npm install xlsx @supabase/supabase-js
 * 2. node scripts/import-to-supabase.js
 * 
 * จะ import 2 ตาราง:
 * - archetypes (96 แถว)
 * - questions (487 แถว)
 */

const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bruyuwjuewpuntcoeoqe.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BBTO8qP4euOGWHnrJGIsPA_dEfEVGPG'; // ใช้ service_role key สำหรับ import
const EXCEL_FILE = './V6_3_DVJ_Master_Sheet_FINAL.xlsx';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function importArchetypes() {
  const wb = XLSX.readFile(EXCEL_FILE);
  const ws = wb.Sheets['ARCHETYPES'];
  const rows = XLSX.utils.sheet_to_json(ws);

  console.log(`Found ${rows.length} archetypes`);

  const data = rows.map((r, i) => ({
    id: String(r['Archetype_ID'] || '').trim(),
    name_th: r['Archetype_Name'] || '',
    name_en: r['English_Name'] || '',
    via_virtue: r['VIA_Virtue'] || '',
    quadrant: r['Quadrant'] || '',
    jungian: r['Jungian'] || '',
    short_desc: r['Short_Desc'] || '',
    long_desc: r['Long_Desc'] || '',
    strength_1: r['Strength_1'] || '',
    strength_2: r['Strength_2'] || '',
    strength_3: r['Strength_3'] || '',
    challenge: r['Challenge'] || '',
    career_hint: r['Career_Hint'] || '',
    caution: r['Caution'] || '',
    recommendation: r['Recommendation'] || '',
    color_hex: r['Color_Hex'] || '#1A3A5C',
    image_url: r['Image_URL'] || '',
    misunderstand_text: r['Misunderstand_Text'] || '',
    social_tip_q1: r['Social_Tip_Q1'] || '',
    social_tip_q2: r['Social_Tip_Q2'] || '',
    social_tip_q3: r['Social_Tip_Q3'] || '',
    social_tip_q4: r['Social_Tip_Q4'] || '',
    self_warning: r['Self_Warning'] || '',
    compatible_1: r['Compatible_1'] || '',
    compatible_2: r['Compatible_2'] || '',
    compatible_3: r['Compatible_3'] || '',
    high_adj_group: r['HighAdj_Group'] || '',
    high_adj_advice: r['HighAdj_Advice'] || '',
    is_active: String(r['Is_Active'] || '').toUpperCase() === 'TRUE',
    band_available: r['Band_Available'] || '',
  })).filter(d => d.id);

  // Clear existing
  await supabase.from('archetypes').delete().neq('id', '');
  
  // Insert in batches of 20
  for (let i = 0; i < data.length; i += 20) {
    const batch = data.slice(i, i + 20);
    const { error } = await supabase.from('archetypes').insert(batch);
    if (error) console.error(`Batch ${i}: ${error.message}`);
    else console.log(`Archetypes: ${i + batch.length}/${data.length}`);
  }
}

async function importQuestions() {
  const wb = XLSX.readFile(EXCEL_FILE);
  const ws = wb.Sheets['QUESTIONS'];
  const rows = XLSX.utils.sheet_to_json(ws);

  console.log(`Found ${rows.length} questions`);

  const data = rows.map((r, i) => ({
    id: String(r['Q_ID'] || '').trim(),
    band: r['Band'] || '',
    session: r['Session'] || 'S1',
    section: r['Section'] || '',
    dimension: r['Dimension'] || '',
    question_th: r['Question_TH'] || '',
    choice_a: r['ChoiceA'] || '',
    choice_b: r['ChoiceB'] || '',
    choice_c: r['ChoiceC'] || null,
    choice_d: r['ChoiceD'] || null,
    score_a: r['ScoreA'] || '',
    score_b: r['ScoreB'] || '',
    score_c: r['ScoreC'] || null,
    score_d: r['ScoreD'] || null,
    display_mode: r['Display_Mode'] || '4choice',
    alert_flag: r['Alert_Flag'] || null,
    branch_trigger: r['Branch_Trigger'] || 'ALWAYS',
    branch_group: r['Branch_Group'] || null,
    sort_order: i + 1,
    is_active: true,
  })).filter(d => d.id);

  // Clear existing
  await supabase.from('questions').delete().neq('id', '');

  // Insert in batches
  for (let i = 0; i < data.length; i += 20) {
    const batch = data.slice(i, i + 20);
    const { error } = await supabase.from('questions').insert(batch);
    if (error) console.error(`Batch ${i}: ${error.message}`);
    else console.log(`Questions: ${i + batch.length}/${data.length}`);
  }
}

async function importLocations() {
  const wb = XLSX.readFile(EXCEL_FILE);
  const ws = wb.Sheets['LOCATIONS'];
  if (!ws) { console.log('No LOCATIONS sheet found'); return; }
  const rows = XLSX.utils.sheet_to_json(ws);
  console.log(`Found ${rows.length} locations`);

  const data = rows.map(r => ({
    region: r['Region'] || '',
    province_th: r['Province_TH'] || '',
    province_en: r['Province_EN'] || '',
  })).filter(d => d.province_th);

  await supabase.from('locations').delete().neq('id', 0);
  for (let i = 0; i < data.length; i += 20) {
    const batch = data.slice(i, i + 20);
    const { error } = await supabase.from('locations').insert(batch);
    if (error) console.error(`Batch ${i}: ${error.message}`);
    else console.log(`Locations: ${i + batch.length}/${data.length}`);
  }
}

async function main() {
  console.log('═══ KRUTH DEMM Import ═══\n');
  await importArchetypes();
  console.log('');
  await importQuestions();
  console.log('');
  await importLocations();
  console.log('\n✅ Import complete!');
}

main().catch(console.error);
