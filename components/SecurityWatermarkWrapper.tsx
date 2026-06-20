'use client';
import React, { useEffect, useState, useRef } from 'react';

interface SecurityWatermarkWrapperProps {
  children: React.ReactNode;
  adminEmail: string;
  adminName: string;
  orgId: string;
  enabled: boolean;
}

export default function SecurityWatermarkWrapper({
  children,
  adminEmail,
  adminName,
  orgId,
  enabled
}: SecurityWatermarkWrapperProps) {
  const [ipAddress, setIpAddress] = useState<string>('...');
  const [currentDateTime, setCurrentDateTime] = useState<string>('');
  const [isBlurred, setIsBlurred] = useState<boolean>(false);
  const blurLoggedRef = useRef<boolean>(false);

  // 1. Fetch IP Address on mount
  useEffect(() => {
    if (!enabled) return;

    async function fetchIp() {
      try {
        const res = await fetch('/api/audit/ip');
        const data = await res.json();
        if (data.ip) {
          setIpAddress(data.ip);
        }
      } catch (err) {
        console.error('Failed to fetch client IP:', err);
        setIpAddress('127.0.0.1');
      }
    }
    fetchIp();
  }, [enabled]);

  // 2. Keep date/time updated every minute to ensure fresh watermarks
  useEffect(() => {
    if (!enabled) return;

    const updateDateTime = () => {
      const now = new Date();
      // Format as DD/MM/YYYY HH:mm in Bangkok timezone
      const formatted = now.toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      setCurrentDateTime(formatted);
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 60 * 1000);
    return () => clearInterval(interval);
  }, [enabled]);

  // 3. Audit Logging helper for security incidents
  const logSecurityEvent = async (actionType: string, reason: string) => {
    try {
      if (!adminEmail || !orgId) return;
      await fetch('/api/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executive_id: adminEmail,
          org_id: orgId,
          action_type: actionType,
          access_granted_to: 'ZERO_TRUST_SCREEN_SECURITY',
          target_resource_id: 'SENSITIVE_VIEW_PORT',
          metadata: {
            reason,
            client_timestamp: new Date().toISOString()
          }
        })
      });
    } catch (err) {
      console.error('Failed to log security event:', err);
    }
  };

  // 4. Tab visibility change & Window blur listener
  useEffect(() => {
    if (!enabled) {
      setIsBlurred(false);
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsBlurred(true);
        if (!blurLoggedRef.current) {
          logSecurityEvent('SECURITY_BLUR', 'visibility_hidden_tab_switch');
          blurLoggedRef.current = true;
        }
      }
    };

    const handleBlur = () => {
      setIsBlurred(true);
      if (!blurLoggedRef.current) {
        logSecurityEvent('SECURITY_BLUR', 'window_focus_lost');
        blurLoggedRef.current = true;
      }
    };

    const handleFocus = () => {
      setIsBlurred(false);
      blurLoggedRef.current = false;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [enabled, adminEmail, orgId]);

  // 5. Copy/cut blocker
  useEffect(() => {
    if (!enabled) return;

    const handleCopyCut = (e: ClipboardEvent) => {
      e.preventDefault();
      logSecurityEvent('COPY_ATTEMPT', 'unauthorized_copy_shortcut');
      alert('🔒 ปิดใช้งานการคัดลอกหรือตัดข้อมูลเพื่อความปลอดภัยความมั่นคงระดับรัฐ (Zero-Trust Policy)');
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      logSecurityEvent('RIGHT_CLICK_ATTEMPT', 'unauthorized_context_menu');
    };

    document.addEventListener('copy', handleCopyCut);
    document.addEventListener('cut', handleCopyCut);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('copy', handleCopyCut);
      document.removeEventListener('cut', handleCopyCut);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [enabled, adminEmail, orgId]);

  if (!enabled) {
    return <>{children}</>;
  }

  // 6. Generate SVG string and encode it for watermark background
  // Display: ชื่อ-นามสกุล (if available) | email | IP | วันที่เปิดดู
  const watermarkText = adminName?.trim()
    ? `${adminName.trim()} | ${adminEmail} | IP: ${ipAddress} | ${currentDateTime}`
    : `${adminEmail} | IP: ${ipAddress} | ${currentDateTime}`;
  
  // Dynamic inline SVG with diagonal text rotated -25 degrees
  const svgString = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
      <text x="30" y="160" fill="#1A3A5C" font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="bold" opacity="0.04" transform="rotate(-25, 30, 160)">
        ${watermarkText}
      </text>
    </svg>
  `;
  
  const encodedSvg = typeof window !== 'undefined' 
    ? btoa(unescape(encodeURIComponent(svgString)))
    : '';
  const watermarkBackground = encodedSvg 
    ? `url("data:image/svg+xml;base64,${encodedSvg}")` 
    : '';

  return (
    <div className="relative min-h-screen w-full select-none" id="watermarked-content">
      {/* Print protection block style */}
      <style jsx global>{`
        @media print {
          body {
            background-color: black !important;
            color: black !important;
          }
          #watermarked-content {
            display: none !important;
          }
          .print-blocked-overlay {
            display: block !important;
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: black !important;
            color: white !important;
            display: flex !important;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            font-weight: bold;
            z-index: 9999999 !important;
          }
        }
      `}</style>

      {/* Repeating Diagonal Watermark Overlay */}
      <div 
        className="pointer-events-none fixed inset-0 z-50 h-full w-full" 
        style={{ 
          backgroundImage: watermarkBackground,
          backgroundRepeat: 'repeat',
          mixBlendMode: 'multiply'
        }}
      />

      {/* Screen blur overlay when tab switches or focus is lost */}
      {isBlurred && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gray-900/60 backdrop-blur-xl transition-all duration-300">
          <div className="bg-white border border-gray-100 p-8 rounded-3xl shadow-2xl max-w-md text-center space-y-4 transform scale-100 transition-all duration-300">
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto text-rose-600 animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900">🔒 ข้อมูลความลับถูกซ่อนชั่วคราว</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              เนื่องจากระบบตรวจพบความพยายามเปลี่ยนหน้าจอหรือการเปลี่ยนโฟกัส เพื่อป้องกันภัยความมั่นคงและข้อมูลรั่วไหล กรุณากลับมายังแท็บหลักเพื่อปลดล็อกการเบลอ
            </p>
            <div className="text-[10px] text-gray-400 bg-gray-50 p-2 rounded-xl">
              การสลับแท็บ/ลดหน้าจอจะถูกบันทึกในประวัตินิติวิทยาศาสตร์ พร้อมระบุชื่อ: <span className="font-bold text-gray-600">{adminName?.trim() || adminEmail}</span>
            </div>
          </div>
        </div>
      )}

      {/* Main page content wrapped */}
      <div className="relative z-10 w-full h-full">
        {children}
      </div>

      {/* Print prevention backup element */}
      <div className="print-blocked-overlay hidden">
        🔒 บล็อกการสั่งพิมพ์: เอกสารความลับด้านสุขภาวะและสิทธิ์การประเมิน
      </div>
    </div>
  );
}
