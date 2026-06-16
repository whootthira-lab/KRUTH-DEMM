import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';

import { headers } from 'next/headers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const headersList = headers();
  const host = headersList.get('host');
  const proto = headersList.get('x-forwarded-proto') || 'https';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (host ? `${proto}://${host}` : 'https://kruthdemm.vercel.app');

  const { data: result } = await supabase
    .from('results').select('archetype_id, archetype_name_th, archetype_name_en')
    .eq('user_id', params.id)
    .order('created_at', { ascending: false }).limit(1).single();

  const ogImage = `${appUrl}/api/og?id=${params.id}`;

  if (!result) {
    return { title: 'KRUTH DEMM — ค้นหาตัวตน', description: 'มาค้นหา Archetype ของคุณ!' };
  }

  const title = `${result.archetype_name_th} — KRUTH DEMM`;
  const desc = `ฉันเป็น "${result.archetype_name_th}" (${result.archetype_name_en}) ✨ ตัวตนของคุณเป็นอย่างไร? กดเพื่อทำแบบประเมิน!`;

  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      url: `${appUrl}/result/${params.id}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: result.archetype_name_th }],
      type: 'website',
      siteName: 'KRUTH DEMM',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: desc,
      images: [ogImage],
    },
  };
}

export default function ResultLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}