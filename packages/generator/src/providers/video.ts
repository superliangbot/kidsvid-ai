import type { VideoProvider } from '@kidsvid/shared';
import { GoogleGenAI } from '@google/genai';

// ─── Google Veo 3.1 (Primary) ───

export interface VeoOptions {
  apiKey: string;
  model?: string;
  resolution?: '720p' | '1080p' | '4k';
  aspectRatio?: '16:9' | '9:16';
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

/** Google Veo 3.1 video generation — primary provider.
 * Generates 4-8 second clips with natively generated audio via the Gemini API. */
export class VeoVideoProvider implements VideoProvider {
  private client: GoogleGenAI;
  private model: string;
  private resolution: string;
  private aspectRatio: string;
  private pollIntervalMs: number;
  private maxPollAttempts: number;

  constructor(options: VeoOptions) {
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.model = options.model ?? 'veo-3.1-generate-preview';
    this.resolution = options.resolution ?? '720p';
    this.aspectRatio = options.aspectRatio ?? '16:9';
    this.pollIntervalMs = options.pollIntervalMs ?? 10_000;
    this.maxPollAttempts = options.maxPollAttempts ?? 36; // 6 minutes
  }

  async generate(
    prompt: string,
    duration: number,
  ): Promise<{ videoUrl: string; duration: number }> {
    // Clamp duration to Veo's supported values (4, 6, or 8 seconds)
    const veoDuration = duration <= 5 ? 4 : duration <= 7 ? 6 : 8;

    let operation = await this.client.models.generateVideos({
      model: this.model,
      prompt: this.enhancePrompt(prompt),
      config: {
        aspectRatio: this.aspectRatio,
        resolution: this.resolution,
        durationSeconds: veoDuration,
        personGeneration: 'allow_all',
      },
    });

    // Poll until done
    let attempts = 0;
    while (!operation.done) {
      if (attempts++ >= this.maxPollAttempts) {
        throw new Error(`Veo generation timed out after ${attempts} poll attempts`);
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      operation = await this.client.operations.getVideosOperation({ operation });
    }

    const generatedVideos = operation.response?.generatedVideos;
    if (!generatedVideos || generatedVideos.length === 0) {
      throw new Error('Veo returned no generated videos');
    }

    const video = generatedVideos[0].video;
    if (!video) {
      throw new Error('Veo video object is missing');
    }

    // Download the video — in production, pipe to cloud storage
    const videoUri = typeof video === 'string' ? video : (video as { uri?: string }).uri;
    return {
      videoUrl: videoUri ?? `veo://${this.model}/${Date.now()}.mp4`,
      duration: veoDuration,
    };
  }

  private enhancePrompt(prompt: string): string {
    return `${prompt}. Style: colorful children's animation, bright and friendly, child-safe content, suitable for ages 2-8.`;
  }
}

// ─── Nano Banana (Fallback) ───

export interface NanoBananaOptions {
  apiKey: string;
  baseUrl?: string;
  resolution?: string;
}

/** Nano Banana video provider — lightweight fallback for quick prototyping.
 * Prompt-based generation with resolution, motion, and camera controls. */
export class NanoBananaVideoProvider implements VideoProvider {
  private apiKey: string;
  private baseUrl: string;
  private resolution: string;

  constructor(options: NanoBananaOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://api.nanobanana.com/v1';
    this.resolution = options.resolution ?? '720p';
  }

  async generate(
    prompt: string,
    duration: number,
  ): Promise<{ videoUrl: string; duration: number }> {
    const response = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        prompt: this.enhancePrompt(prompt),
        duration_seconds: Math.min(duration, 10),
        resolution: this.resolution,
        motion: 'smooth',
        camera: 'static',
        style: 'animation',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Nano Banana API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as { video_url: string; duration: number };
    return {
      videoUrl: data.video_url,
      duration: data.duration,
    };
  }

  private enhancePrompt(prompt: string): string {
    return `${prompt}. Bright colorful children's cartoon style, child-safe, ages 2-8.`;
  }
}

// ─── Runway / Kling / Sora (scaffolds) ───

export class RunwayVideoProvider implements VideoProvider {
  constructor(private apiKey: string) {}

  async generate(
    prompt: string,
    duration: number,
  ): Promise<{ videoUrl: string; duration: number }> {
    throw new Error(
      'Runway provider not yet implemented. Use VeoVideoProvider or MockVideoProvider.',
    );
  }
}

export class KlingVideoProvider implements VideoProvider {
  constructor(private apiKey: string) {}

  async generate(
    prompt: string,
    duration: number,
  ): Promise<{ videoUrl: string; duration: number }> {
    throw new Error(
      'Kling provider not yet implemented. Use VeoVideoProvider or MockVideoProvider.',
    );
  }
}

export class SoraVideoProvider implements VideoProvider {
  constructor(private apiKey: string) {}

  async generate(
    prompt: string,
    duration: number,
  ): Promise<{ videoUrl: string; duration: number }> {
    throw new Error(
      'Sora provider not yet implemented. Use VeoVideoProvider or MockVideoProvider.',
    );
  }
}

// ─── Mock ───

export class MockVideoProvider implements VideoProvider {
  async generate(
    prompt: string,
    duration: number,
  ): Promise<{ videoUrl: string; duration: number }> {
    return {
      videoUrl: `mock://video/${Date.now()}.mp4`,
      duration,
    };
  }
}

// ─── Factory ───

export type VideoProviderName = 'veo' | 'nanobanana' | 'runway' | 'kling' | 'sora';

export function createVideoProvider(
  provider: VideoProviderName,
  apiKey: string,
): VideoProvider {
  switch (provider) {
    case 'veo':
      return new VeoVideoProvider({ apiKey });
    case 'nanobanana':
      return new NanoBananaVideoProvider({ apiKey });
    case 'runway':
      return new RunwayVideoProvider(apiKey);
    case 'kling':
      return new KlingVideoProvider(apiKey);
    case 'sora':
      return new SoraVideoProvider(apiKey);
    default:
      throw new Error(`Unknown video provider: ${provider}`);
  }
}
