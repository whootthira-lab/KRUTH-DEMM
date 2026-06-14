import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, voice } = body as { text: string; voice?: string };

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const selectedVoice = voice || 'google'; // Defaults to Google Cloud TTS

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
              audioEncoding: 'MP3'
            }
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.audioContent) {
            const audioBuffer = Buffer.from(data.audioContent, 'base64');
            return new Response(audioBuffer, {
              headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=3600'
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

    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600'
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
