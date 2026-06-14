import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, voice } = body as { text: string; voice?: string };

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const selectedVoice = voice || 'premwadee'; // Defaults to Azure Premwadee

    // 1. Check Azure Speech Service if requested
    if (selectedVoice === 'premwadee') {
      const azureKey = process.env.AZURE_SPEECH_KEY;
      const azureRegion = process.env.AZURE_SPEECH_REGION || 'southeastasia';

      if (azureKey) {
        console.log("TTS: Using Azure TTS Premwadee...");
        const url = `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
        const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="th-TH">
  <voice name="th-TH-PremwadeeNeural">
    ${text}
  </voice>
</speak>`;

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': azureKey,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
            'User-Agent': 'KRUTH-DEMM'
          },
          body: ssml
        });

        if (res.ok) {
          const audioBuffer = await res.arrayBuffer();
          return new Response(audioBuffer, {
            headers: {
              'Content-Type': 'audio/mpeg',
              'Cache-Control': 'public, max-age=3600'
            }
          });
        } else {
          const errText = await res.text();
          console.error('Azure TTS API error, falling back:', errText);
        }
      } else {
        console.warn('Azure Speech Key is not configured. Falling back to OpenAI shimmer...');
      }
    }

    // 2. Fallback to OpenAI TTS
    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      return NextResponse.json({ error: 'OpenAI API Key is not configured' }, { status: 500 });
    }

    const openAiVoice = (selectedVoice === 'premwadee') ? 'shimmer' : (selectedVoice === 'nova' ? 'nova' : 'shimmer');

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
