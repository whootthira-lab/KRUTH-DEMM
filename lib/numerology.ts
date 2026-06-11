// 📂 lib/numerology.ts

// 1. ตารางเทียบค่าตัวอักษรไทย-อังกฤษ (อิงตามหลักเลขศาสตร์มาตรฐาน)
// สามารถปรับเปลี่ยนตัวเลขในนี้ได้ถ้าใช้ตำราเฉพาะของ KRUTH DEMM
const letterValues: Record<string, number> = {
  // เลข 1
  'ก': 1, 'ด': 1, 'ท': 1, 'ถ': 1, 'ภ': 1, 'ฤ': 1, 'ฤๅ': 1, 'า': 1, 'ำ': 1, 'อ': 1, 'ั': 1, 'ิ': 1, 'ี': 1, 'ึ': 1, 'ื': 1, 'ุ': 1, 'ู': 1,
  'A': 1, 'J': 1, 'S': 1,
  // เลข 2
  'ข': 2, 'ช': 2, 'ง': 2, 'บ': 2, 'ป': 2, 'เ': 2, 'แ': 2, 'โ': 2, 'ใ': 2, 'ไ': 2,
  'B': 2, 'K': 2, 'T': 2,
  // เลข 3
  'ฆ': 3, 'ฑ': 3, 'ฒ': 3, 'ต': 3,
  'C': 3, 'L': 3, 'U': 3,
  // เลข 4
  'ค': 4, 'ธ': 4, 'ร': 4, 'ญ': 4, 'ษ': 4,
  'D': 4, 'M': 4, 'V': 4,
  // เลข 5
  'ฉ': 5, 'ณ': 5, 'ฌ': 5, 'น': 5, 'ม': 5, 'ห': 5, 'ฮ': 5, 'ฬ': 5,
  'E': 5, 'N': 5, 'W': 5,
  // เลข 6
  'จ': 6, 'ล': 6, 'ว': 6,
  'F': 6, 'O': 6, 'X': 6,
  // เลข 7
  'ศ': 7, 'ส': 7, 'ซ': 7,
  'G': 7, 'P': 7, 'Y': 7,
  // เลข 8
  'ย': 8, 'พ': 8, 'ฟ': 8, 'ผ': 8, 'ฝ': 8,
  'H': 8, 'Q': 8, 'Z': 8,
  // เลข 9
  'ฏ': 9, 'ฐ': 9, '์': 9, // การันต์
  'I': 9, 'R': 9,
};

// ฟังก์ชันลดทอนสมการให้เหลือไม่เกิน 2 หลัก
function reduceToTwoDigits(num: number): number {
  if (num <= 99) return num;
  // ถ้าเกิน 99 ให้เอาตัวเลขแต่ละหลักมาบวกกัน (เช่น 105 -> 1+0+5 = 6)
  return String(num).split('').reduce((sum, digit) => sum + parseInt(digit), 0);
}

// แปลงคำเป็นตัวเลขแล้วบวกกัน
function calculateWordValue(word: string): number {
  let sum = 0;
  const cleanWord = word.replace(/\s+/g, ''); // ตัดช่องว่างทิ้ง
  for (const char of cleanWord) {
    if (letterValues[char]) {
      sum += letterValues[char];
    }
  }
  return reduceToTwoDigits(sum);
}

// 🚨 ฟังก์ชันหลักที่จะถูกเรียกไปใช้งาน
export function calculateNumerology(name: string, surname: string, dobString: string) {
  // 1. เลขกำลังชื่อ
  const numName = calculateWordValue(name);
  
  // 2. เลขกำลังนามสกุล
  const numSurname = calculateWordValue(surname);
  
  // 3. เลขกำลังวันเกิด (07/10/1986 -> 7+1+0+1+9+8+6)
  const digitsOnly = dobString.replace(/\D/g, ''); // ดึงมาเฉพาะตัวเลข
  const numBirthRaw = digitsOnly.split('').reduce((sum, digit) => sum + parseInt(digit), 0);
  const numBirth = reduceToTwoDigits(numBirthRaw);

  // 4. เลขกำลังชื่อ + นามสกุล
  const numFullName = reduceToTwoDigits(numName + numSurname);

  // 5. เลขกำลังประจำตัว (ชื่อ + นามสกุล + วันเกิด)
  const numLife = reduceToTwoDigits(numName + numSurname + numBirth);

  return {
    num_name: numName,
    num_surname: numSurname,
    num_birth: numBirth,
    num_fullname: numFullName,
    num_life: numLife
  };
}