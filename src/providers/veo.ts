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

export interface ReferenceImage {
  /** Base64-encoded image bytes. */
  imageBytes: string;
  /** MIME type. Defaults to 'image/png'. */
  mimeType?: string;
  /** Reference type. 'asset' for character/object references. */
  referenceType?: 'asset';
}

export interface VeoClipOptions {
  /** Motion-only prompt — do NOT re-describe the character (the image has it). */
  prompt: string;
  /** Starting frame as base64-encoded PNG/JPEG. If omitted, text-to-video is used. */
  startingFrame?: string;
  /** MIME type for the starting frame. Defaults to 'image/png'. */
  startingFrameMime?: string;
  /** Last frame for interpolation (Veo 3.1 only). Base64. */
  lastFrame?: string;
  /** MIME type for the last frame. Defaults to 'image/png'. */
  lastFrameMime?: string;
  /**
   * Up to 3 reference images to guide character/asset consistency (Veo 3.1 only).
   * Pass multi-angle character refs here (front, side, back).
   */
  referenceImages?: ReferenceImage[];
  /** Clip duration in seconds (Veo supports 5–8). */
  durationSec?: number;
  /** Aspect ratio. Defaults to '16:9'. */
  aspectRatio?: '16:9' | '9:16';
  /** Resolution. Defaults to '1080p'. */
  resolution?: '720p' | '1080p' | '4k';
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
    const resolution = options.resolution ?? '1080p';

    // Build the generateVideos request — Gemini API schema
    const config: Record<string, unknown> = {
      aspectRatio,
      durationSeconds: durationSec,
      resolution,
      negativePrompt,
      personGeneration: 'allow_all',
      ...(options.seed !== undefined ? { seed: options.seed } : {}),
    };

    // Reference images for character consistency (Veo 3.1 only, up to 3)
    if (options.referenceImages && options.referenceImages.length > 0) {
      config.referenceImages = options.referenceImages.map((ref) => ({
        image: {
          imageBytes: ref.imageBytes,
          mimeType: ref.mimeType ?? 'image/png',
        },
        referenceType: ref.referenceType ?? 'asset',
      }));
    }

    // Last frame for interpolation (Veo 3.1 only)
    if (options.lastFrame) {
      config.lastFrame = {
        imageBytes: options.lastFrame,
        mimeType: options.lastFrameMime ?? 'image/png',
      };
    }

    const request: Record<string, unknown> = {
      model: this.model,
      prompt: options.prompt,
      config,
    };

    // Image-to-video: pass `image` directly as starting frame
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
