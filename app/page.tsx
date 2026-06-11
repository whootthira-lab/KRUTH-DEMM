'use client';
import { useRouter } from 'next/navigation';
import { BAND_INFO, Band } from '@/lib/types';
import { trackPageView, trackEvent } from '@/lib/supabase';
import { useEffect } from 'react';
import Image from 'next/image';

export default function Home() {
  const router = useRouter();

  useEffect(() => { trackPageView('/'); }, []);

  const selectBand = (band: Band) => {
    trackEvent('band_selected', 'navigation', { band });
    router.push(`/quiz?band=${band}`);
  };

  return (
    <div className="space-y-5">
      {/* ═══ PREMIUM IMAGE BANNER SECTION (โชว์รูปอย่างเดียว) ═══ */}
      <div className="relative w-full h-[220px] sm:h-[260px] md:h-[320px] rounded-2xl overflow-hidden shadow-lg">
        <Image
          src="https://drive.google.com/thumbnail?id=1f8Nnp2cCTYtpQTiuZcG9a4asKb_ovECL&sz=w800"
          alt="KRUTH DEMM Banner"
          fill
          priority
          className="object-cover object-center" 
        />
      </div>

      {/* ═══ SELECTOR SECTION ═══ */}
      <div className="bg-white rounded-2xl p-6 shadow-lg">
        <h2 className="text-[#1A3A5C] text-lg font-bold mb-1">เลือกช่วงอายุของคุณ</h2>
        <p className="text-xs text-gray-500 mb-5">ระบบจะเลือกแบบประเมินที่เหมาะสมกับช่วงวัยให้อัตโนมัติ</p>

        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(BAND_INFO) as Band[]).map((band) => {
            const info = BAND_INFO[band];
            return (
              <button key={band} onClick={() => selectBand(band)}
                className={`p-4 rounded-xl border-2 border-gray-100 bg-white hover:border-[#1A3A5C] hover:bg-blue-50 
                  hover:-translate-y-1 hover:shadow-md transition-all text-center group
                  ${band === 'G' ? 'col-span-2' : ''}`}>
                <span className="text-3xl block mb-2 group-hover:scale-110 transition-transform">{info.icon}</span>
                <span className="text-[0.65rem] text-gray-400 block mb-0.5">{info.age}</span>
                <span className="text-sm font-bold text-[#1A3A5C]">{info.name}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center text-[0.7rem] text-yellow-800 flex items-center justify-center gap-2">
          <span className="text-orange-500 text-lg">⚠️</span>
          <span className="text-left leading-tight"><strong>ข้อมูลสำคัญ:</strong> ผลประเมินนี้เป็นสัญญาณเบื้องต้น ไม่ใช่การวินิจฉัยทางการแพทย์</span>
        </div>

        <p className="text-[0.65rem] text-gray-400 text-center mt-4 leading-relaxed">
          🔒 ระบบไม่เก็บข้อมูลโดยไม่ได้รับความยินยอม (PDPA)<br/>
          © KRUTH APEX | KRUTH DEMM Platform
        </p>
      </div>
    </div>
  );
}