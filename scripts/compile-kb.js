const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const baseDir = "e:/kruthdemm/kruthdemm-20260423T113426Z-3-001/kruthdemm";
const outputFilePath = path.join(baseDir, 'lib/satiya_kb.json');

console.log("=== START COMPILING SATIYA KNOWLEDGE BASE ===");

const compiledKB = {
  theories: [],
  theory_mappings: [],
  wellbeing_patterns: [],
  kwi_scoring_rules: {},
  toxic_workplace_dimensions: [],
  toxic_scoring_rules: [],
  toxic_rules_json: {}
};

// 1. Read Psychology_Theories_KB.xlsx
const theoriesPath = path.join(baseDir, 'Psychology_Theories_KB.xlsx');
if (fs.existsSync(theoriesPath)) {
  try {
    const wb = XLSX.readFile(theoriesPath);
    const theoriesSheet = wb.Sheets['Theories_Master'] || wb.Sheets['Theories'];
    if (theoriesSheet) {
      const rawTheories = XLSX.utils.sheet_to_json(theoriesSheet);
      compiledKB.theories = rawTheories.map(row => ({
        Theory_ID: row.theory_id || row.Theory_ID || '',
        Name: row.theory_name || row.Name || '',
        Source: row.evidence_level || row.Source || '',
        Key_Principles: row.core_concept || row.Key_Principles || '',
        Application_Steps: row.explain_to_user || row.Application_Steps || ''
      }));
      console.log(`- Loaded ${compiledKB.theories.length} theories (mapped from Theories_Master)`);
    }
    const mappingsSheet = wb.Sheets['Mappings'] || wb.Sheets['Theory_Selector_Rules'];
    if (mappingsSheet) {
      compiledKB.theory_mappings = XLSX.utils.sheet_to_json(mappingsSheet);
      console.log(`- Loaded ${compiledKB.theory_mappings.length} theory mappings`);
    }
  } catch (e) {
    console.error("Error reading Psychology_Theories_KB.xlsx:", e.message);
  }
} else {
  console.warn("Psychology_Theories_KB.xlsx not found");
}

// 2. Read Satiya_KWI_KB.xlsx
const satiyaPath = path.join(baseDir, 'Satiya_KWI_KB.xlsx');
if (fs.existsSync(satiyaPath)) {
  try {
    const wb = XLSX.readFile(satiyaPath);
    if (wb.Sheets['Wellbeing_Patterns']) {
      compiledKB.wellbeing_patterns = XLSX.utils.sheet_to_json(wb.Sheets['Wellbeing_Patterns']);
      console.log(`- Loaded ${compiledKB.wellbeing_patterns.length} wellbeing patterns`);
    }
  } catch (e) {
    console.error("Error reading Satiya_KWI_KB.xlsx:", e.message);
  }
} else {
  console.warn("Satiya_KWI_KB.xlsx not found");
}

// 3. Read Toxic_Workplace_KB.xlsx
const toxicKbPath = path.join(baseDir, 'Toxic_Workplace_KB.xlsx');
if (fs.existsSync(toxicKbPath)) {
  try {
    const wb = XLSX.readFile(toxicKbPath);
    const dimensionsSheet = wb.Sheets['Toxic_Pattern_Library'] || wb.Sheets['Workplace_Dimensions'];
    if (dimensionsSheet) {
      compiledKB.toxic_workplace_dimensions = XLSX.utils.sheet_to_json(dimensionsSheet);
      console.log(`- Loaded ${compiledKB.toxic_workplace_dimensions.length} toxic workplace dimensions`);
    }
    const scoringSheet = wb.Sheets['Toxic_Scoring_Rules'];
    if (scoringSheet) {
      compiledKB.toxic_scoring_rules = XLSX.utils.sheet_to_json(scoringSheet);
      console.log(`- Loaded ${compiledKB.toxic_scoring_rules.length} toxic scoring rules`);
    }
    const questionsSheet = wb.Sheets['Assessment_Questions'] || wb.Sheets['Questions'];
    if (questionsSheet) {
      const rawQuestions = XLSX.utils.sheet_to_json(questionsSheet);
      compiledKB.toxic_questions = rawQuestions.map(row => ({
        Q_ID: row.q_id || row.Q_ID || '',
        Question_TH: row.question_th || row.Question_TH || '',
        ChoiceA: row.choice_A || row.ChoiceA || '',
        ChoiceB: row.choice_B || row.ChoiceB || '',
        ChoiceC: row.choice_C || row.ChoiceC || '',
        ChoiceD: row.choice_D || row.ChoiceD || ''
      }));
      console.log(`- Loaded ${compiledKB.toxic_questions.length} toxic questions (mapped from Assessment_Questions)`);
    }
  } catch (e) {
    console.error("Error reading Toxic_Workplace_KB.xlsx:", e.message);
  }
} else {
  console.warn("Toxic_Workplace_KB.xlsx not found");
}

// 4. Read Satiya_KWI_Scoring_Rules.json
const scoringJsonPath = path.join(baseDir, 'Satiya_KWI_Scoring_Rules.json');
if (fs.existsSync(scoringJsonPath)) {
  try {
    const data = fs.readFileSync(scoringJsonPath, 'utf8');
    compiledKB.kwi_scoring_rules = JSON.parse(data);
    console.log(`- Loaded KWI scoring rules JSON`);
  } catch (e) {
    console.error("Error reading Satiya_KWI_Scoring_Rules.json:", e.message);
  }
} else {
  console.warn("Satiya_KWI_Scoring_Rules.json not found");
}

// 5. Read Toxic_Workplace_Rules.json
const toxicJsonPath = path.join(baseDir, 'Toxic_Workplace_Rules.json');
if (fs.existsSync(toxicJsonPath)) {
  try {
    const data = fs.readFileSync(toxicJsonPath, 'utf8');
    compiledKB.toxic_rules_json = JSON.parse(data);
    console.log(`- Loaded Toxic Workplace rules JSON`);
  } catch (e) {
    console.error("Error reading Toxic_Workplace_Rules.json:", e.message);
  }
} else {
  console.warn("Toxic_Workplace_Rules.json not found");
}

// Save compiled JSON
try {
  fs.writeFileSync(outputFilePath, JSON.stringify(compiledKB, null, 2), 'utf8');
  console.log(`\n✅ Successfully compiled knowledge base into: ${outputFilePath}`);
} catch (e) {
  console.error("Error writing output JSON:", e.message);
}
