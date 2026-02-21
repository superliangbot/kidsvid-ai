import type { VoiceProvider } from '@kidsvid/shared';
import { GoogleGenAI } from '@google/genai';

// ─── OpenAI TTS (Default) ───

export const OPENAI_VOICES = [
  { id: 'alloy', name: 'Alloy', description: 'Neutral, warm' },
  { id: 'echo', name: 'Echo', description: 'Calm, clear' },
  { id: 'fable', name: 'Fable', description: 'Expressive, storytelling' },
  { id: 'onyx', name: 'Onyx', description: 'Deep, authoritative' },
  { id: 'nova', name: 'Nova', description: 'Friendly, upbeat' },
  { id: 'shimmer', name: 'Shimmer', description: 'Bright, cheerful' },
] as const;

export type OpenAIVoiceId = (typeof OPENAI_VOICES)[number]['id'];

export interface OpenAITTSOptions {
  apiKey: string;
  model?: 'tts-1' | 'tts-1-hd';
  /** Default voice for narration. "nova" and "shimmer" work best for kids content. */
  defaultVoice?: OpenAIVoiceId;
  /** Playback speed: 0.25 to 4.0. Kids content should be slightly slower (0.9). */
  speed?: number;
  /** Response format. "mp3" is default, "opus" for streaming, "wav" for editing. */
  responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
}

/** OpenAI TTS voice generation provider.
 * Uses the tts-1 or tts-1-hd model with child-friendly voices. */
export class OpenAITTSProvider implements VoiceProvider {
  private apiKey: string;
  private model: 'tts-1' | 'tts-1-hd';
  private defaultVoice: OpenAIVoiceId;
  private speed: number;
  private responseFormat: string;

  constructor(options: OpenAITTSOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'tts-1';
    this.defaultVoice = options.defaultVoice ?? 'nova';
    this.speed = options.speed ?? 0.9;
    this.responseFormat = options.responseFormat ?? 'mp3';
  }

  async generate(
    text: string,
    voiceId?: string,
  ): Promise<{ audioUrl: string; duration: number }> {
    const voice = voiceId || this.defaultVoice;

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        voice,
        speed: this.speed,
        response_format: this.responseFormat,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI TTS API error ${response.status}: ${body}`);
    }

    // The API returns raw audio bytes. In production, pipe to storage (S3/GCS).
    const audioBuffer = await response.arrayBuffer();
    const estimatedDuration = estimateSpeechDuration(text, this.speed);

    return {
      audioUrl: `openai-tts://${voice}/${this.model}/${Date.now()}.${this.responseFormat}`,
      duration: estimatedDuration,
    };
  }

  async listVoices(): Promise<{ id: string; name: string; preview: string }[]> {
    return OPENAI_VOICES.map((v) => ({
      id: v.id,
      name: `${v.name} — ${v.description}`,
      preview: '',
    }));
  }

  /** Generate speech and return the raw audio buffer (for piping to storage). */
  async generateBuffer(
    text: string,
    voiceId?: string,
  ): Promise<{ buffer: ArrayBuffer; duration: number; contentType: string }> {
    const voice = voiceId || this.defaultVoice;

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        voice,
        speed: this.speed,
        response_format: this.responseFormat,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI TTS API error ${response.status}: ${body}`);
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || `audio/${this.responseFormat}`;

    return {
      buffer,
      duration: estimateSpeechDuration(text, this.speed),
      contentType,
    };
  }
}

// ─── Google Gemini TTS ───

export interface GeminiTTSOptions {
  apiKey: string;
  model?: string;
  voiceName?: string;
}

/** Google Gemini TTS voice generation provider.
 * Uses the Gemini API with audio output modality for text-to-speech. */
export class GeminiTTSProvider implements VoiceProvider {
  private client: GoogleGenAI;
  private model: string;
  private voiceName: string;

  constructor(options: GeminiTTSOptions) {
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.model = options.model ?? 'gemini-2.5-flash';
    this.voiceName = options.voiceName ?? 'Kore';
  }

  async generate(
    text: string,
    voiceId?: string,
  ): Promise<{ audioUrl: string; duration: number }> {
    const voice = voiceId || this.voiceName;

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: `Read this text aloud in a friendly, child-appropriate voice suitable for kids ages 2-8: ${text}`,
      config: {
        responseModalities: ['audio'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice,
            },
          },
        },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      throw new Error('Gemini TTS returned no audio content');
    }

    const audioPart = parts.find((p: Record<string, unknown>) => p.inlineData);
    if (!audioPart || !audioPart.inlineData) {
      throw new Error('Gemini TTS response contains no audio data');
    }

    const estimatedDuration = estimateSpeechDuration(text);

    return {
      audioUrl: `gemini-tts://${voice}/${this.model}/${Date.now()}.wav`,
      duration: estimatedDuration,
    };
  }

  async listVoices(): Promise<{ id: string; name: string; preview: string }[]> {
    return GEMINI_VOICES.map((v) => ({
      id: v.id,
      name: `${v.name} — ${v.description}`,
      preview: '',
    }));
  }
}

export const GEMINI_VOICES = [
  { id: 'Kore', name: 'Kore', description: 'Bright, energetic' },
  { id: 'Puck', name: 'Puck', description: 'Playful, upbeat' },
  { id: 'Charon', name: 'Charon', description: 'Calm, warm' },
  { id: 'Fenrir', name: 'Fenrir', description: 'Expressive, deep' },
  { id: 'Aoede', name: 'Aoede', description: 'Soft, gentle' },
  { id: 'Leda', name: 'Leda', description: 'Clear, friendly' },
] as const;

// ─── Mock ───

export class MockVoiceProvider implements VoiceProvider {
  async generate(
    text: string,
    voiceId?: string,
  ): Promise<{ audioUrl: string; duration: number }> {
    return {
      audioUrl: `mock://voice/${voiceId || 'nova'}/${Date.now()}.mp3`,
      duration: estimateSpeechDuration(text),
    };
  }

  async listVoices(): Promise<{ id: string; name: string; preview: string }[]> {
    return OPENAI_VOICES.map((v) => ({
      id: v.id,
      name: `${v.name} — ${v.description}`,
      preview: '',
    }));
  }
}

// ─── Factory ───

export type VoiceProviderName = 'openai' | 'gemini';

export function createVoiceProvider(
  provider: VoiceProviderName,
  apiKey: string,
): VoiceProvider {
  switch (provider) {
    case 'openai':
      return new OpenAITTSProvider({ apiKey });
    case 'gemini':
      return new GeminiTTSProvider({ apiKey });
    default:
      throw new Error(`Unknown voice provider: ${provider}`);
  }
}

/** Recommended voice mappings for different character types */
export const CHARACTER_VOICE_MAP: Record<string, OpenAIVoiceId> = {
  narrator: 'nova',
  'Cosmo': 'nova',
  'Melody': 'shimmer',
  'Professor Paws': 'fable',
  'Brave Bea': 'alloy',
  'Pixel & Dot': 'echo',
};

export function estimateSpeechDuration(text: string, speed = 1.0): number {
  // Average speaking rate: ~150 words per minute for kids content (slower pace)
  const words = text.split(/\s+/).length;
  return Math.round((words / 150) * 60 / speed);
}
