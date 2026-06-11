import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateDVJId, calcThaiElement, calcChineseElement } from '@/lib/scoring';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { band, day, month, year, fname, lname, idcard, gender, province, referrerId, referralSource } = body;

  if (!band || !day || !month || !year || !fname || !lname || !gender) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }

  const input = idcard || ('ANON' + Date.now());
  const dvjId = generateDVJId(input);

  const dob = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;

  const thaiElement = calcThaiElement(month);
  const chineseElement = calcChineseElement(year, month, day);
  const dayOfWeek = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'][dob.getDay()];

  // ═══ Zodiac calculation ═══
  const zodiac = calcZodiac(day, month);

  // 🚨 ═══ Zodiac Animal (คำนวณปีนักษัตร) ═══ 🚨
  const zodiacAnimal = calculateZodiacAnimal(year);

  // ═══ Name Elements — คำนวณจาก name_numerology table ═══
  const nameElements = await calcNameElements(fname, lname);

  // 🚨 ═══ Numerology (คำนวณเลขศาสตร์ 5 ค่า) ═══ 🚨
  const numero = calcNumerology(fname, lname, day, month, year);

  // Save to Supabase
  const { error } = await supabase.from('users').insert({
    id: dvjId,
    full_name: fname + ' ' + lname,
    first_name: fname,
    last_name: lname,
    gender,
    dob: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
    age,
    birth_province: province || '',
    day_of_week: dayOfWeek,
    thai_element: thaiElement,
    chinese_element: chineseElement,
    zodiac_sign: zodiac.name,
    zodiac_element: zodiac.element,
    zodiac_animal: zodiacAnimal, // บันทึกปีนักษัตร
    name_fire_pct: nameElements.fire,
    name_earth_pct: nameElements.earth,
    name_wind_pct: nameElements.wind,
    name_water_pct: nameElements.water,
    
    // 🚨 บันทึกเลขศาสตร์ 5 ค่าลงฐานข้อมูล 🚨
    num_name: numero.numName,
    num_surname: numero.numSurname,
    num_birth: numero.numBirth,
    num_fullname: numero.numFullName,
    num_life: numero.numLife,

    referrer_id: referrerId && referrerId !== 'DIRECT' ? referrerId : null,
    utm_source: referralSource || 'DIRECT',
    is_anonymous: !idcard,
    pdpa_consent: true,
    device_type: body.deviceType || null,
    browser: body.browser || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Create quiz session
  const { data: session } = await supabase.from('quiz_sessions').insert({
    user_id: dvjId, band, status: 'started',
    device_type: body.deviceType || null,
    referrer_url: body.referrerUrl || null,
  }).select('id').single();

  // Track referral
  if (referrerId && referrerId !== 'DIRECT') {
    await supabase.from('referrals').insert({
      referrer_id: referrerId, referred_id: dvjId,
      platform: referralSource || 'direct',
      registered_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    ok: true,
    dvjId,
    sessionId: session?.id || null,
    age,
    dayOfWeek,
    thaiElement,
    chineseElement,
    zodiac: zodiac.name,
    zodiacElement: zodiac.element,
    zodiacAnimal: zodiacAnimal,
    nameElements,
    numerology: numero 
  });
}

// 🚨 ═══ ฟังก์ชันคำนวณปีนักษัตร ═══ 🚨
function calculateZodiacAnimal(year: number): string {
  const zodiacAnimals = [
    "ชวด", "ฉลู", "ขาล", "เถาะ", "มะโรง", "มะเส็ง", 
    "มะเมีย", "มะแม", "วอก", "ระกา", "จอ", "กุน"
  ];
  const index = (year - 1924) % 12;
  // เผื่อกรณีย้อนหลังไปก่อนปี 1924 (ผลลัพธ์ index จะติดลบ)
  return zodiacAnimals[index >= 0 ? index : index + 12];
}

// 🚨 ═══ ฟังก์ชันคำนวณเลขศาสตร์ (Numerology) ═══ 🚨
function calcNumerology(fname: string, lname: string, d: number, m: number, y: number) {
  // ตารางเทียบอักษรเป็นตัวเลข
  const values: Record<string, number> = {
    'ก':1, 'ด':1, 'ท':1, 'ถ':1, 'ภ':1, 'ฤ':1, 'ฤๅ':1, 'า':1, 'ำ':1, 'อ':1, 'ั':1, 'ิ':1, 'ี':1, 'ึ':1, 'ื':1, 'ุ':1, 'ู':1, 'A':1, 'J':1, 'S':1,
    'ข':2, 'ช':2, 'ง':2, 'บ':2, 'ป':2, 'เ':2, 'แ':2, 'โ':2, 'ใ':2, 'ไ':2, 'B':2, 'K':2, 'T':2,
    'ฆ':3, 'ฑ':3, 'ฒ':3, 'ต':3, 'C':3, 'L':3, 'U':3,
    'ค':4, 'ธ':4, 'ร':4, 'ญ':4, 'ษ':4, 'D':4, 'M':4, 'V':4,
    'ฉ':5, 'ณ':5, 'ฌ':5, 'น':5, 'ม':5, 'ห':5, 'ฮ':5, 'ฬ':5, 'E':5, 'N':5, 'W':5,
    'จ':6, 'ล':6, 'ว':6, 'F':6, 'O':6, 'X':6,
    'ศ':7, 'ส':7, 'ซ':7, 'G':7, 'P':7, 'Y':7,
    'ย':8, 'พ':8, 'ฟ':8, 'ผ':8, 'ฝ':8, 'H':8, 'Q':8, 'Z':8,
    'ฏ':9, 'ฐ':9, '์':9, 'I':9, 'R':9,
  };

  const reduce = (num: number): number => {
    if (num <= 99) return num;
    return String(num).split('').reduce((sum, digit) => sum + parseInt(digit), 0);
  };

  const getVal = (word: string): number => {
    let sum = 0;
    const clean = word.replace(/\s+/g, '');
    for (const char of clean) {
      if (values[char]) sum += values[char];
    }
    return reduce(sum);
  };

  const numName = getVal(fname);
  const numSurname = getVal(lname);
  
  const dobStr = `${y}${m}${d}`;
  const numBirthRaw = dobStr.split('').reduce((sum, char) => sum + parseInt(char), 0);
  const numBirth = reduce(numBirthRaw);

  const numFullName = reduce(numName + numSurname);
  const numLife = reduce(numName + numSurname + numBirth);

  return { numName, numSurname, numBirth, numFullName, numLife };
}

// ═══ Calculate Name Elements from Supabase ═══
async function calcNameElements(firstName: string, lastName: string) {
  const { data: charMap } = await supabase.from('name_numerology').select('character, element_en');
  if (!charMap || charMap.length === 0) return { fire: 0, earth: 0, wind: 0, water: 0 };

  const map: Record<string, string> = {};
  for (const row of charMap) {
    if (row.character) map[row.character] = row.element_en;
  }

  const full = firstName + lastName;
  const counts: Record<string, number> = { Fire: 0, Earth: 0, Wind: 0, Water: 0 };
  let total = 0;

  for (const ch of full) {
    const elem = map[ch] || map[ch.toUpperCase()];
    if (elem && counts[elem] !== undefined) { counts[elem]++; total++; }
  }

  if (total === 0) return { fire: 0, earth: 0, wind: 0, water: 0 };
  return {
    fire: Math.round(counts.Fire / total * 100),
    earth: Math.round(counts.Earth / total * 100),
    wind: Math.round(counts.Wind / total * 100),
    water: Math.round(counts.Water / total * 100),
  };
}

// ═══ Zodiac ═══
function calcZodiac(day: number, month: number) {
  const md = month * 100 + day;
  const signs = [
    { n:'มังกร',e:'ธาตุดิน',s:115,e2:212 },{ n:'กุมภ์',e:'ธาตุลม',s:213,e2:314 },
    { n:'มีน',e:'ธาตุน้ำ',s:315,e2:412 },{ n:'เมษ',e:'ธาตุไฟ',s:413,e2:513 },
    { n:'พฤษภ',e:'ธาตุดิน',s:514,e2:614 },{ n:'เมถุน',e:'ธาตุลม',s:615,e2:715 },
    { n:'กรกฎ',e:'ธาตุน้ำ',s:716,e2:816 },{ n:'สิงห์',e:'ธาตุไฟ',s:817,e2:916 },
    { n:'กันย์',e:'ธาตุดิน',s:917,e2:1016 },{ n:'ตุลย์',e:'ธาตุลม',s:1017,e2:1115 },
    { n:'พิจิก',e:'ธาตุน้ำ',s:1116,e2:1215 },{ n:'ธนู',e:'ธาตุไฟ',s:1216,e2:114 },
  ];
  for (const z of signs) {
    if (z.s > z.e2) { if (md >= z.s || md <= z.e2) return { name: z.n, element: z.e }; }
    else { if (md >= z.s && md <= z.e2) return { name: z.n, element: z.e }; }
  }
  return { name: '', element: '' };
}