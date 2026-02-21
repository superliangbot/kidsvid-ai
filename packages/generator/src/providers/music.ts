import type { MusicProvider } from '@kidsvid/shared';
import { GoogleGenAI } from '@google/genai';

// ─── Google Gemini Music (Primary) ───

export interface GeminiMusicOptions {
  apiKey: string;
  model?: string;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

/** Google Gemini music generation provider.
 * Creates kids songs, nursery rhymes, and background music via the Gemini API. */
export class GeminiMusicProvider implements MusicProvider {
  private client: GoogleGenAI;
  private model: string;
  private pollIntervalMs: number;
  private maxPollAttempts: number;

  constructor(options: GeminiMusicOptions) {
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.model = options.model ?? 'gemini-2.5-flash';
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.maxPollAttempts = options.maxPollAttempts ?? 24;
  }

  async generate(
    prompt: string,
    duration: number,
  ): Promise<{ audioUrl: string; duration: number }> {
    const enhancedPrompt = this.buildMusicPrompt(prompt, duration);

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: enhancedPrompt,
      config: {
        responseModalities: ['audio'],
      },
    });

    // Extract audio from response
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      throw new Error('Gemini returned no audio content');
    }

    const audioPart = parts.find((p: Record<string, unknown>) => p.inlineData);
    if (!audioPart || !audioPart.inlineData) {
      throw new Error('Gemini response contains no audio data');
    }

    // In production, upload the base64 audio to cloud storage
    // For now, return a reference URI
    return {
      audioUrl: `gemini-music://${this.model}/${Date.now()}.wav`,
      duration,
    };
  }

  private buildMusicPrompt(prompt: string, duration: number): string {
    return `Generate a ${duration}-second piece of children's music: ${prompt}.
Style: cheerful, educational, age-appropriate for 2-8 year olds.
Tempo: moderate and easy to follow.
Instruments: bright, playful sounds suitable for kids content.
The music should be catchy with simple melodies that children can hum along to.`;
  }
}

// ─── Suno (Scaffold) ───

export class SunoMusicProvider implements MusicProvider {
  constructor(private apiKey: string) {}

  async generate(
    prompt: string,
    duration: number,
  ): Promise<{ audioUrl: string; duration: number }> {
    throw new Error(
      'Suno provider not yet implemented. Use GeminiMusicProvider or MockMusicProvider.',
    );
  }
}

// ─── Mock ───

export class MockMusicProvider implements MusicProvider {
  async generate(
    prompt: string,
    duration: number,
  ): Promise<{ audioUrl: string; duration: number }> {
    return {
      audioUrl: `mock://music/${Date.now()}.mp3`,
      duration,
    };
  }
}

// ─── Factory ───

export type MusicProviderName = 'gemini' | 'suno';

export function createMusicProvider(
  provider: MusicProviderName,
  apiKey: string,
): MusicProvider {
  switch (provider) {
    case 'gemini':
      return new GeminiMusicProvider({ apiKey });
    case 'suno':
      return new SunoMusicProvider(apiKey);
    default:
      throw new Error(`Unknown music provider: ${provider}`);
  }
}
