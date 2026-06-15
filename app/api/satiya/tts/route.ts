import { NextRequest, NextResponse } from 'next/server';

// Global in-memory cache to store pre-generated TTS audio files
const ttsCache = new Map<string, { buffer: Buffer; contentType: string }>();
let isPrecached = false;

// Background pre-caching of AQ1-AQ5 questions
async function preCacheQuestions() {
  if (isPrecached) return;
  isPrecached = true;

  console.log("TTS: Pre-caching AQ1-AQ5 questions...");
  const aqTexts = [
    "พฤติกรรมที่รู้สึกว่ามีปัญหา เกิดบ่อยแค่ไหน?",
    "เคยพูดคุยกับเขาตรงๆ เรื่องนี้ไหม? ถ้าเคย เขาตอบสนองอย่างไร?",
    "พฤติกรรมนี้เกิดกับคุณคนเดียว หรือกับคนอื่นด้วย?",
    "คุณรู้สึกอย่างไรกับตัวเองในช่วงนี้?",
    "ถ้าต้องอธิบาย 'ผลลัพธ์ที่อยากได้' จากการพูดคุยครั้งนี้ คือ?",
    "ฟังดูเหนื่อยมากนะคะ สิ่งที่เจออยู่มีชื่อเรียก และไม่ใช่ความอ่อนแอของคุณ\nขอถามเพื่อให้ช่วยได้ตรงขึ้นนะคะ — พฤติกรรมที่รู้สึกว่ามีปัญหา เกิดบ่อยแค่ไหน?"
  ];

  for (const text of aqTexts) {
    const cacheKey = `google_${text}`;
    if (ttsCache.has(cacheKey)) continue;

    const googleKey = process.env.GOOGLE_TTS_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (googleKey && googleKey !== 'mock_key') {
      try {
        const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text },
            voice: { languageCode: 'th-TH', name: 'th-TH-Neural2-F' },
            audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 22050 }
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.audioContent) {
            ttsCache.set(cacheKey, {
              buffer: Buffer.from(data.audioContent, 'base64'),
              contentType: 'audio/mpeg'
            });
            console.log(`TTS: Pre-cached Google voice for text: "${text.substring(0, 20)}..."`);
          }
        }
      } catch (err) {
        console.error(`TTS: Failed to pre-cache Google voice for text: "${text.substring(0, 20)}"`, err);
      }
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, voice } = body as { text: string; voice?: string };

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const selectedVoice = voice || 'google'; // Defaults to Google Cloud TTS
    const cacheKey = `${selectedVoice}_${text.trim()}`;

    // Trigger pre-caching in the background asynchronously
    preCacheQuestions().catch(err => console.error("TTS: Background pre-caching failed:", err));

    // Serve from cache if available
    if (ttsCache.has(cacheKey)) {
      console.log(`TTS: Serving from cache for key: ${cacheKey}`);
      const cached = ttsCache.get(cacheKey)!;
      return new Response(new Uint8Array(cached.buffer), {
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      });
    }

    // 1. Check Google Cloud Text-to-Speech (Neural2)
    if (selectedVoice === 'google') {
      const googleKey = process.env.GOOGLE_TTS_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

      if (googleKey && googleKey !== 'mock_key') {
        console.log("TTS: Trying Google Cloud TTS...");
        const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleKey}`;
        
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            input: { text },
            voice: {
              languageCode: 'th-TH',
              name: 'th-TH-Neural2-F' // Emits natural female Thai voice (Neural2)
            },
            audioConfig: {
              audioEncoding: 'MP3',
              sampleRateHertz: 22050 // Speed optimized sample rate to reduce latency
            }
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.audioContent) {
            const audioBuffer = Buffer.from(data.audioContent, 'base64');
            ttsCache.set(cacheKey, { buffer: audioBuffer, contentType: 'audio/mpeg' });
            return new Response(new Uint8Array(audioBuffer), {
              headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=31536000, immutable'
              }
            });
          }
        } else {
          const errText = await res.text();
          console.error('Google TTS API error, falling back to OpenAI:', errText);
        }
      } else {
        console.warn('Google API key is not configured for TTS. Falling back to OpenAI shimmer...');
      }
    }

    // 2. Fallback to OpenAI TTS
    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      return NextResponse.json({ error: 'OpenAI API Key is not configured' }, { status: 500 });
    }

    const openAiVoice = (selectedVoice === 'google') ? 'shimmer' : (selectedVoice === 'nova' ? 'nova' : 'shimmer');

    console.log(`TTS: Using OpenAI TTS ${openAiVoice}...`);
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: openAiVoice,
        response_format: 'mp3'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI TTS API error:', errorText);
      return NextResponse.json(
        { error: 'Failed to generate speech from OpenAI', details: errorText },
        { status: response.status }
      );
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    ttsCache.set(cacheKey, { buffer: audioBuffer, contentType: 'audio/mpeg' });

    return new Response(new Uint8Array(audioBuffer), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch (error: any) {
    console.error('TTS Route Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
