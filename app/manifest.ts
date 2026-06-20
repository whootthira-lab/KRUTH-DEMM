import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KRUTH MIND Platform',
    short_name: 'KRUTH MIND',
    description: 'ระบบประเมินบุคลิกภาพ 96 แบบ ผสานจิตวิทยาสากลกับศาสตร์ธาตุตะวันออก',
    start_url: '/admin',
    display: 'standalone',
    background_color: '#0b0f19',
    theme_color: '#1A3A5C',
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
