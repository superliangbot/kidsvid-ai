import type { VoiceProvider } from '@kidsvid/shared';

/** ElevenLabs voice generation provider */

export class ElevenLabsVoiceProvider implements VoiceProvider {
  private baseUrl = 'https://api.elevenlabs.io/v1';

  constructor(private apiKey: string) {}

  async generate(
    text: string,
    voiceId: string,
  ): Promise<{ audioUrl: string; duration: number }> {
    const response = await fetch(
      `${this.baseUrl}/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.75,
            style: 0.5,
          },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`ElevenLabs API error ${response.status}: ${body}`);
    }

    // In production, stream the audio to storage and return URL
    // For now, return placeholder
    return {
      audioUrl: 'placeholder://elevenlabs-output.mp3',
      duration: estimateSpeechDuration(text),
    };
  }

  async listVoices(): Promise<{ id: string; name: string; preview: string }[]> {
    const response = await fetch(`${this.baseUrl}/voices`, {
      headers: { 'xi-api-key': this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error ${response.status}`);
    }

    const data = (await response.json()) as {
      voices: { voice_id: string; name: string; preview_url: string }[];
    };

    return data.voices.map((v) => ({
      id: v.voice_id,
      name: v.name,
      preview: v.preview_url,
    }));
  }
}

/** Mock provider for development */
export class MockVoiceProvider implements VoiceProvider {
  async generate(
    text: string,
    voiceId: string,
  ): Promise<{ audioUrl: string; duration: number }> {
    return {
      audioUrl: `mock://voice/${voiceId}/${Date.now()}.mp3`,
      duration: estimateSpeechDuration(text),
    };
  }

  async listVoices(): Promise<{ id: string; name: string; preview: string }[]> {
    return [
      { id: 'kids-narrator', name: 'Kids Narrator', preview: '' },
      { id: 'cheerful-female', name: 'Cheerful Female', preview: '' },
      { id: 'friendly-male', name: 'Friendly Male', preview: '' },
    ];
  }
}

function estimateSpeechDuration(text: string): number {
  // Average speaking rate: ~150 words per minute for kids content (slower)
  const words = text.split(/\s+/).length;
  return Math.round((words / 150) * 60);
}
