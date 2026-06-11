'use client';
import { useState } from 'react';
import Link from 'next/link';

const thaiNumerologyMap: Record<string, number> = {
  'ก':1,'ด':1,'ถ':1,'ท':1,'ภ':1,'ฤ':1,'า':1,'ำ':1,'่':1,
  'ข':2,'ช':2,'ง':2,'บ':2,'ป':2,'เ':2,'แ':2,'้':2,
  'ฆ':3,'ฑ':3,'ฒ':3,'ต':3,'ฬ':3,'ุ':3,'ู':3,
  'ค':4,'ธ':4,'ร':4,'ญ':4,'ษ':4,'โ':4,'ไ':4,'ใ':4,'ะ':4,'ั':4,
  'ฉ':5,'ณ':5,'ฌ':5,'น':5,'ม':5,'ห':5,'ฮ':5,'ฎ':5,'ิ':5,'ี':5,
  'จ':6,'ล':6,'ว':6,'อ':6,
  'ซ':7,'ศ':7,'ส':7,'ฏ':7,'ึ':7,'ื':7,'๊':7,
  'ย':8,'ผ':8,'ฝ':8,'พ':8,'ฟ':8,
  'ฐ':9,'์':9,'๋':9
};

const reduceToTwoDigits = (num: number): number => {
  if (num <= 99) return num;
  let currentStr = num.toString();
  while (parseInt(currentStr) > 99) {
    currentStr = currentStr.split('').reduce((acc, val) => acc + parseInt(val), 0).toString();
  }
  return parseInt(currentStr);
};

const calculateWordEnergy = (word: string): number => {
  let sum = 0;
  for (const char of word) {
    if (thaiNumerologyMap[char]) sum += thaiNumerologyMap[char];
  }
  return reduceToTwoDigits(sum);
};

const calculateDOBEnergy = (dateStr: string): number => {
  if (!dateStr) return 0;
  const numbersOnly = dateStr.replace(/\D/g, ''); 
  const sum = numbersOnly.split('').reduce((acc, val) => acc + parseInt(val), 0);
  return reduceToTwoDigits(sum);
};

export default function CalculatorPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState(''); 
  const [results, setResults] = useState<any>(null);

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    const nameEnergy = calculateWordEnergy(firstName);
    const surnameEnergy = calculateWordEnergy(lastName);
    const dobEnergy = calculateDOBEnergy(dob);
    const fullNameEnergy = reduceToTwoDigits(nameEnergy + surnameEnergy);
    const corePersonalEnergy = reduceToTwoDigits(nameEnergy + surnameEnergy + dobEnergy);
    setResults({ nameEnergy, surnameEnergy, dobEnergy, fullNameEnergy, corePersonalEnergy });
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] py-8 px-4 font-sans text-gray-800">
      <div className="max-w-xl mx-auto space-y-6">
        
        <div className="bg-gradient-to-r from-[#1A3A5C] to-[#2E75B6] rounded-2xl p-6 text-white shadow-lg text-center relative overflow-hidden">
          <div className="absolute -top-4 -right-4 text-7xl opacity-10">🔢</div>
          <h1 className="text-2xl font-bold mb-1">ระบบวิเคราะห์เลขศาสตร์</h1>
          <p className="text-sm text-blue-100">L1: Energy Calculation Engine</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-md">
          <form onSubmit={handleCalculate} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-[#1A3A5C] mb-1">ชื่อจริง (ภาษาไทย)</label>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:border-[#1A3A5C] focus:ring-1 focus:ring-[#1A3A5C]" placeholder="เช่น วุฒิ์ธิระ" required />
            </div>
            <div>
              <label className="block text-sm font-bold text-[#1A3A5C] mb-1">นามสกุล (ภาษาไทย)</label>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:border-[#1A3A5C] focus:ring-1 focus:ring-[#1A3A5C]" placeholder="เช่น ครุฑขุนทด" required />
            </div>
            <div>
              <label className="block text-sm font-bold text-[#1A3A5C] mb-1">วัน/เดือน/ปีเกิด (ค.ศ.)</label>
              <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="w-full border border-gray-200 rounded-lg p-3 outline-none focus:border-[#1A3A5C] focus:ring-1 focus:ring-[#1A3A5C]" required />
            </div>
            <button type="submit" className="w-full bg-[#1A3A5C] hover:bg-[#112a45] text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md mt-4">
              ประมวลผลข้อมูล
            </button>
          </form>
        </div>

        {results && (
          <div className="bg-white rounded-2xl p-6 shadow-md space-y-4 border-t-4 border-amber-400">
            <h2 className="text-xl font-bold text-[#1A3A5C] text-center mb-4">ผลการคำนวณพลังงาน</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 p-4 rounded-xl text-center border border-blue-100"><p className="text-xs text-gray-500 mb-1">1. เลขกำลังชื่อ</p><p className="text-3xl font-extrabold text-[#2E75B6]">{results.nameEnergy}</p></div>
              <div className="bg-blue-50 p-4 rounded-xl text-center border border-blue-100"><p className="text-xs text-gray-500 mb-1">2. เลขกำลังนามสกุล</p><p className="text-3xl font-extrabold text-[#2E75B6]">{results.surnameEnergy}</p></div>
            </div>
            <div className="bg-emerald-50 p-4 rounded-xl text-center border border-emerald-100"><p className="text-xs text-gray-500 mb-1">3. เลขกำลังประจำวันเกิด</p><p className="text-3xl font-extrabold text-emerald-600">{results.dobEnergy}</p></div>
            <div className="bg-purple-50 p-4 rounded-xl text-center border border-purple-100"><p className="text-xs text-gray-500 mb-1">4. เลขกำลัง ชื่อ + นามสกุล</p><p className="text-3xl font-extrabold text-purple-600">{results.fullNameEnergy}</p></div>
            <div className="bg-amber-100 p-6 rounded-xl text-center shadow-inner border border-amber-200 relative overflow-hidden">
              <div className="absolute -top-6 -right-6 text-6xl opacity-20">✨</div>
              <p className="text-sm text-amber-800 font-bold mb-1">5. เลขกำลังประจำตัว (Core Energy)</p>
              <p className="text-5xl font-black text-amber-600 drop-shadow-sm mb-2">{results.corePersonalEnergy}</p>
            </div>
          </div>
        )}
        <div className="text-center"><Link href="/" className="text-sm text-gray-500 hover:text-[#1A3A5C] underline">กลับหน้าหลัก</Link></div>
      </div>
    </div>
  );
}