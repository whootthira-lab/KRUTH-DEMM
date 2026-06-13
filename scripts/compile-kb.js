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
    if (wb.Sheets['Theories']) {
      compiledKB.theories = XLSX.utils.sheet_to_json(wb.Sheets['Theories']);
      console.log(`- Loaded ${compiledKB.theories.length} theories`);
    }
    if (wb.Sheets['Mappings']) {
      compiledKB.theory_mappings = XLSX.utils.sheet_to_json(wb.Sheets['Mappings']);
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
    if (wb.Sheets['Workplace_Dimensions']) {
      compiledKB.toxic_workplace_dimensions = XLSX.utils.sheet_to_json(wb.Sheets['Workplace_Dimensions']);
      console.log(`- Loaded ${compiledKB.toxic_workplace_dimensions.length} toxic workplace dimensions`);
    }
    if (wb.Sheets['Toxic_Scoring_Rules']) {
      compiledKB.toxic_scoring_rules = XLSX.utils.sheet_to_json(wb.Sheets['Toxic_Scoring_Rules']);
      console.log(`- Loaded ${compiledKB.toxic_scoring_rules.length} toxic scoring rules`);
    }
    if (wb.Sheets['Questions']) {
      compiledKB.toxic_questions = XLSX.utils.sheet_to_json(wb.Sheets['Questions']);
      console.log(`- Loaded ${compiledKB.toxic_questions.length} toxic questions`);
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
