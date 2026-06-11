import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'KRUTH DEMM — ค้นหาตัวตน',
  description: 'แบบประเมินบุคลิกภาพ 96 แบบ ผสานจิตวิทยาสากลกับศาสตร์ธาตุตะวันออก',
  openGraph: {
    title: 'KRUTH DEMM — ค้นหาตัวตน',
    description: 'คุณเป็นคนแบบไหน? มาค้นหา Archetype ของคุณ!',
    url: 'https://kruth-demm-final.vercel.app',
    siteName: 'KRUTH DEMM',
    images: [
      {
        url: 'https://drive.google.com/thumbnail?id=1f8Nnp2cCTYtpQTiuZcG9a4asKb_ovECL&sz=w1200',
        width: 1200,
        height: 630,
        alt: 'KRUTH DEMM Thumbnail',
      },
    ],
    locale: 'th_TH',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KRUTH DEMM — ค้นหาตัวตน',
    description: 'คุณเป็นคนแบบไหน? มาค้นหา Archetype ของคุณ!',
    images: ['https://drive.google.com/thumbnail?id=1f8Nnp2cCTYtpQTiuZcG9a4asKb_ovECL&sz=w1200'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-screen bg-[#F0F4F8] text-gray-800">
        <main className="max-w-lg mx-auto px-4 py-6 pb-20">
          {children}
        </main>
      </body>
    </html>
  );
}