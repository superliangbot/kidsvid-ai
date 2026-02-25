/**
 * Imagen 4 Image Provider
 *
 * Uses Google's Imagen 4 model for high-quality image generation.
 * Primary use cases:
 * - Per-scene starting frames for Veo (character in scene context)
 * - Thumbnail generation (replacing DALL-E)
 * - Reference image generation
 */

import { GoogleGenAI } from '@google/genai';

export interface ImagenOptions {
  apiKey: string;
  model?: string;
}

export interface GenerateImageOptions {
  /** The image generation prompt. */
  prompt: string;
  /** Number of candidate images to generate. Defaults to 1. */
  numberOfImages?: number;
  /** Aspect ratio. Defaults to '16:9'. */
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
  /** Negative prompt to avoid unwanted features. */
  negativePrompt?: string;
}

export interface GeneratedImage {
  /** Base64-encoded image bytes. */
  base64: string;
  /** MIME type (typically 'image/png'). */
  mimeType: string;
}

export class ImagenProvider {
  private client: GoogleGenAI;
  private model: string;

  constructor(options: ImagenOptions) {
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.model = options.model ?? 'imagen-4.0-generate-001';
  }

  /**
   * Generate one or more images with Imagen 4.
   * Returns an array of base64-encoded images.
   */
  async generateImages(options: GenerateImageOptions): Promise<GeneratedImage[]> {
    const response = await this.client.models.generateImages({
      model: this.model,
      prompt: options.prompt,
      config: {
        numberOfImages: options.numberOfImages ?? 1,
        aspectRatio: options.aspectRatio ?? '16:9',
        ...(options.negativePrompt ? { negativePrompt: options.negativePrompt } : {}),
      },
    });

    const images = response.generatedImages;
    if (!images || images.length === 0) {
      throw new Error('Imagen returned no generated images');
    }

    return images.map((img) => {
      const imageData = img.image;
      if (!imageData) {
        throw new Error('Imagen image object is missing');
      }
      // The SDK returns imageBytes as base64 string
      const base64 =
        typeof imageData === 'string'
          ? imageData
          : (imageData as { imageBytes?: string }).imageBytes;
      if (!base64) {
        throw new Error('Imagen image bytes are missing');
      }
      return {
        base64,
        mimeType: (imageData as { mimeType?: string }).mimeType ?? 'image/png',
      };
    });
  }

  /**
   * Generate a single image and return it as a Buffer.
   * Convenience method for the common case.
   */
  async generateImage(options: GenerateImageOptions): Promise<Buffer> {
    const images = await this.generateImages({ ...options, numberOfImages: 1 });
    return Buffer.from(images[0].base64, 'base64');
  }
}
