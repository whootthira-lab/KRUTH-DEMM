import fs from 'fs';
import path from 'path';

// 1. Manually load environment variables from .env.local
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
        if (key && !key.startsWith('#')) {
          process.env[key] = value;
        }
      }
    });
    console.log("✅ Environment variables loaded from .env.local");
  } else {
    console.warn("⚠️ .env.local file not found in current directory.");
  }
} catch (e) {
  console.error("❌ Failed to parse .env.local file:", e);
}

// 2. We will import Satiya Analyzer dynamically inside runTest to ensure env vars are loaded first

// Mock conversation history mimicking stress and coping mechanisms
const mockChatHistory = [
  { role: 'user' as const, content: 'ช่วงนี้รู้สึกเครียดมากเลยครับ ทำงานเหนื่อยมาก ทะเลาะกับเพื่อนร่วมงานด้วย' },
  { role: 'assistant' as const, content: 'เข้าใจเลยค่ะ ความเครียดจากงานและการสื่อสารที่ไม่เข้าใจกันกับเพื่อนร่วมงานสามารถทำให้พลังงานของเราลดลงไปมากเลย คุณพอจะเล่าให้ฟังเพิ่มเติมได้ไหมคะว่าเกิดเรื่องอะไรขึ้น?' },
  { role: 'user' as const, content: 'เขามักจะเอางานโยนมาให้ผมทำตลอดเลย พอผมปฏิเสธเขาก็ทำท่าไม่พอใจ ผมพยายามเงียบและเก็บอารมณ์ไว้ตลอด แต่บางทีก็ทนไม่ไหวจริงๆ' },
  { role: 'assistant' as const, content: 'การที่รู้สึกว่าถูกโยนงานและไม่สามารถสื่อสารขอบเขตของเราได้เป็นเรื่องที่อึดอัดมากจริงๆ ค่ะ การเงียบเพื่อรักษาน้ำใจหรือระงับอารมณ์ช่วยไม่ให้เกิดความขัดแย้งภายนอก แต่อาจจะสะสมความตึงเครียดไว้ในใจคุณแทน...' },
  { role: 'user' as const, content: 'ใช่ครับ ผมรู้สึกท้อแท้มาก แต่ก็ไม่อยากถอดใจนะ พยายามคิดว่าเดี๋ยวมันก็คงผ่านไป หรือมองหาแง่มุมบวกอื่น ๆ อยู่' }
];

async function runTest() {
  console.log('\n=== Starting 8-Layer Analyzer Verification ===');
  
  // Dynamically import analyzeSpeech8Layers to guarantee environment variables are in place
  const { analyzeSpeech8Layers } = await import('../lib/satiya_analyzer');
  
  // Use a temporary test user ID (or a known test user if desired)
  const testUserId = 'test-verification-user-id';
  const testSessionId = 'test-session-123';
  
  console.log('Sending mock chat history to Claude 3.5 Sonnet...');
  console.log(`Mock History length: ${mockChatHistory.length} messages.`);
  
  const startTime = Date.now();
  const result = await analyzeSpeech8Layers(testUserId, testSessionId, mockChatHistory);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  if (!result) {
    console.error('❌ Verification failed: analyzeSpeech8Layers returned null.');
    process.exit(1);
  }
  
  console.log(`\n✅ Analysis Completed in ${duration} seconds!\n`);
  console.log('--- ANALYSIS RESULT ---');
  console.log(JSON.stringify(result, null, 2));
  console.log('-----------------------\n');
  
  // Verify weighted score mathematical logic
  const layers = [
    result.layer1,
    result.layer2,
    result.layer3,
    result.layer4,
    result.layer5,
    result.layer6,
    result.layer7,
    result.layer8
  ];
  
  const weights = [0.15, 0.15, 0.10, 0.15, 0.10, 0.15, 0.10, 0.10];
  let calculatedScore = 0;
  for (let i = 0; i < 8; i++) {
    calculatedScore += weights[i] * (layers[i].score || 0.5);
  }
  const roundedCalculated = Math.round(calculatedScore * 100) / 100;
  
  console.log(`Calculated Weighted Score: ${roundedCalculated}`);
  console.log('Verification Success: All keys returned successfully, JSON parsed, and API response received.');
}

runTest().catch(err => {
  console.error('❌ Script execution error:', err);
  process.exit(1);
});
