import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ═══ Helper: Track Events ═══
export async function trackEvent(
  eventType: string,
  eventCategory: string,
  eventData: Record<string, any> = {},
  userId?: string,
  sessionId?: string
) {
  try {
    await supabase.from('user_events').insert({
      user_id: userId || null,
      visitor_id: getVisitorId(),
      session_id: sessionId || null,
      event_type: eventType,
      event_category: eventCategory,
      event_data: eventData,
    });
  } catch (e) { /* silent fail for analytics */ }
}

// ═══ Helper: Track Page View ═══
export async function trackPageView(path: string, userId?: string) {
  try {
    await supabase.from('page_views').insert({
      user_id: userId || null,
      visitor_id: getVisitorId(),
      page_path: path,
      referrer_url: typeof document !== 'undefined' ? document.referrer : null,
      utm_source: getUrlParam('src') || getUrlParam('utm_source'),
      utm_medium: getUrlParam('utm_medium'),
      utm_campaign: getUrlParam('utm_campaign'),
      device_type: getDeviceType(),
      browser: getBrowser(),
      screen_width: typeof window !== 'undefined' ? window.innerWidth : null,
    });
  } catch (e) { /* silent */ }
}

// ═══ Device Detection ═══
export function getDeviceType(): string {
  if (typeof window === 'undefined') return 'unknown';
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

export function getBrowser(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (ua.includes('Line')) return 'LINE';
  if (ua.includes('FBAN') || ua.includes('FBAV')) return 'Facebook';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Firefox')) return 'Firefox';
  return 'Other';
}

function getUrlParam(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(key);
}

function getVisitorId(): string {
  if (typeof localStorage === 'undefined') return 'ssr';
  let id = localStorage.getItem('kruthdemm_visitor');
  if (!id) {
    id = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('kruthdemm_visitor', id);
  }
  return id;
}
