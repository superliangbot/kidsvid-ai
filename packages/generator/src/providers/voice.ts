import type { VoiceProvider } from '@kidsvid/shared';

/** OpenAI TTS voice IDs suitable for kids content */
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
    // For now, consume the response and return metadata.
    const audioBuffer = await response.arrayBuffer();
    const estimatedDuration = estimateSpeechDuration(text, this.speed);

    // In production, upload audioBuffer to cloud storage and return the URL.
    // For development, write to a temp file or return a data reference.
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

/** Mock provider for development and testing */
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

/** Recommended voice mappings for different character types */
export const CHARACTER_VOICE_MAP: Record<string, OpenAIVoiceId> = {
  narrator: 'nova',
  'Cosmo': 'nova',
  'Melody': 'shimmer',
  'Professor Paws': 'fable',
  'Brave Bea': 'alloy',
  'Pixel & Dot': 'echo',
};

function estimateSpeechDuration(text: string, speed = 1.0): number {
  // Average speaking rate: ~150 words per minute for kids content (slower pace)
  const words = text.split(/\s+/).length;
  return Math.round((words / 150) * 60 / speed);
}
