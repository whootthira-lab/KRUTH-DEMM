# KRUTH DEMM — Platform A (Viral)

## Quick Start

### 1. ติดตั้ง Dependencies
```bash
npm install
```

### 2. ตั้งค่า Environment Variables
สร้างไฟล์ `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://bruyuwjuewpuntcoeoqe.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_BBTO8qP4euOGWHnrJGIsPA_dEfEVGPG
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### 3. Import ข้อมูลเข้า Supabase
```bash
# ต้องใส่ service_role key ใน script ก่อน (ไม่ใช่ anon key)
# ไปที่ Supabase Dashboard → Settings → API → service_role key
npm install xlsx @supabase/supabase-js
node scripts/import-to-supabase.js
```

### 4. Run Development
```bash
npm run dev
```

### 5. Deploy to Vercel
```bash
# Option A: Vercel CLI
npx vercel

# Option B: GitHub → Vercel
# Push to GitHub → Connect repo ใน Vercel Dashboard
# ตั้ง Environment Variables ใน Vercel Dashboard
```

## Project Structure
```
kruthdemm/
├── app/
│   ├── layout.tsx          # Root layout (Thai fonts, meta)
│   ├── page.tsx            # Home (band selection)
│   ├── globals.css         # Tailwind + Thai fonts
│   ├── quiz/
│   │   └── page.tsx        # Quiz (adaptive branching)
│   ├── result/
│   │   └── [id]/
│   │       └── page.tsx    # Result display + share
│   └── api/
│       ├── register/route.ts
│       ├── questions/route.ts
│       ├── score/route.ts
│       └── og/route.tsx    # OG Image generator
├── lib/
│   ├── supabase.ts         # Supabase client + analytics
│   ├── scoring.ts          # Big Five + VIA + Jungian + Flags
│   └── types.ts            # TypeScript types
├── components/             # Shared UI components
├── scripts/
│   └── import-to-supabase.js
├── .env.local
├── package.json
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

## Tech Stack
- **Frontend**: Next.js 14 (App Router) + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + RLS + Realtime)
- **Deploy**: Vercel (Edge Functions + OG Image)
- **Analytics**: Custom behavioral tracking (11 tables + 7 views)

## Behavioral Analytics
ระบบเก็บข้อมูลพฤติกรรม 35+ event types:
- Page views + scroll depth + time on page
- Quiz answer latency (มิลลิวินาที)
- Answer changes (เปลี่ยนคำตอบกี่ครั้ง)
- Funnel tracking (started → completed/abandoned)
- Share + Referral + Conversion tracking
- Device + Browser + UTM source
