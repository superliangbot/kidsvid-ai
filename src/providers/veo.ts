/**
 * Veo Video Provider — Correct Gemini API usage
 *
 * CRITICAL FIXES vs. pro-video-v7.ts:
 * - NO `referenceImages` (Vertex AI only, not available on Gemini API)
 * - NO `generateAudio` (Vertex AI only)
 * - Uses `image` parameter directly for image-to-video (starting frame)
 * - Always includes `negativePrompt`
 * - Supports `seed` for cross-scene consistency
 */

import { GoogleGenAI } from '@google/genai';

export interface VeoClipOptions {
  /** Motion-only prompt — do NOT re-describe the character (the image has it). */
  prompt: string;
  /** Starting frame as base64-encoded PNG/JPEG. If omitted, text-to-video is used. */
  startingFrame?: string;
  /** MIME type for the starting frame. Defaults to 'image/png'. */
  startingFrameMime?: string;
  /** Clip duration in seconds (Veo supports 5–8). */
  durationSec?: number;
  /** Aspect ratio. Defaults to '16:9'. */
  aspectRatio?: '16:9' | '9:16';
  /** Negative prompt — always set, but can be extended per-call. */
  negativePrompt?: string;
  /** Seed for reproducibility across scenes. */
  seed?: number;
}

export interface VeoProviderOptions {
  apiKey: string;
  model?: string;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  /** Default negative prompt appended to every call. */
  defaultNegativePrompt?: string;
}

export class VeoProvider {
  private client: GoogleGenAI;
  private apiKey: string;
  private model: string;
  private pollIntervalMs: number;
  private maxPollAttempts: number;
  private defaultNegativePrompt: string;

  constructor(options: VeoProviderOptions) {
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'veo-3.0-generate-001';
    this.pollIntervalMs = options.pollIntervalMs ?? 10_000;
    this.maxPollAttempts = options.maxPollAttempts ?? 60;
    this.defaultNegativePrompt =
      options.defaultNegativePrompt ??
      'blurry, distorted, inconsistent character, morphing, text overlays, subtitles, watermark';
  }

  /**
   * Generate a video clip. If `startingFrame` is provided, uses image-to-video
   * (Veo animates from that frame). Otherwise, text-to-video.
   *
   * Returns the raw video bytes as a Buffer.
   */
  async generateClip(options: VeoClipOptions): Promise<Buffer> {
    const negativePrompt = options.negativePrompt
      ? `${this.defaultNegativePrompt}, ${options.negativePrompt}`
      : this.defaultNegativePrompt;

    const durationSec = options.durationSec ?? 8;
    const aspectRatio = options.aspectRatio ?? '16:9';

    // Build the generateVideos request — Gemini API schema
    const request: Record<string, unknown> = {
      model: this.model,
      prompt: options.prompt,
      config: {
        aspectRatio,
        durationSeconds: durationSec,
        negativePrompt,
        personGeneration: 'allow_all',
        ...(options.seed !== undefined ? { seed: options.seed } : {}),
      },
    };

    // Image-to-video: pass `image` directly (NOT referenceImages)
    if (options.startingFrame) {
      request.image = {
        imageBytes: options.startingFrame,
        mimeType: options.startingFrameMime ?? 'image/png',
      };
    }

    let operation = await this.client.models.generateVideos(request as any);

    // Poll until done
    let attempts = 0;
    while (!operation.done) {
      if (attempts++ >= this.maxPollAttempts) {
        throw new Error(`Veo generation timed out after ${attempts} poll attempts`);
      }
      await sleep(this.pollIntervalMs);
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

    // Download the video bytes
    const videoUri = typeof video === 'string' ? video : (video as { uri?: string }).uri;
    if (!videoUri) {
      throw new Error('Veo video URI is missing');
    }

    const response = await fetch(videoUri, {
      headers: { 'x-goog-api-key': this.apiKey },
    });
    if (!response.ok) {
      throw new Error(`Veo video download failed: ${response.status} ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
