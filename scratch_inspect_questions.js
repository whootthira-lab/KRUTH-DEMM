const XLSX = require('xlsx');
const path = require('path');
const baseDir = "e:/kruthdemm/kruthdemm-20260423T113426Z-3-001/kruthdemm";

const wb = XLSX.readFile(path.join(baseDir, 'Psychology_Theories_KB.xlsx'));
const data = XLSX.utils.sheet_to_json(wb.Sheets['Theories_Master']);
console.log(JSON.stringify(data[0], null, 2));
