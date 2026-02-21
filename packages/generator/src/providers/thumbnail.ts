import type { ThumbnailProvider } from '@kidsvid/shared';

/** DALL-E thumbnail generator. Follows kids content thumbnail best practices:
 * bright saturated colors, expressive characters, bold text, minimal clutter. */

export class DalleThumbnailProvider implements ThumbnailProvider {
  constructor(private apiKey: string) {}

  async generate(
    prompt: string,
    style = 'vibrant',
  ): Promise<{ url: string; metadata: Record<string, unknown> }> {
    const enhancedPrompt = this.enhancePrompt(prompt, style);

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: enhancedPrompt,
        n: 1,
        size: '1792x1024', // YouTube thumbnail aspect ratio (close to 16:9)
        quality: 'hd',
        style: 'vivid',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`DALL-E API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      data: { url: string; revised_prompt: string }[];
    };

    return {
      url: data.data[0].url,
      metadata: {
        revisedPrompt: data.data[0].revised_prompt,
        originalPrompt: prompt,
        style,
      },
    };
  }

  private enhancePrompt(prompt: string, style: string): string {
    return `Create a YouTube kids video thumbnail: ${prompt}.
Style: ${style}, bright saturated colors, high contrast, cartoon/3D animation style.
Requirements: Eye-catching for children ages 2-8, expressive character faces with big emotions,
bold vibrant background, NO text in the image (text will be added separately),
child-safe and friendly, professional quality kids content thumbnail.`;
  }
}

/** Placeholder provider for testing without API calls */
export class MockThumbnailProvider implements ThumbnailProvider {
  async generate(
    prompt: string,
    style?: string,
  ): Promise<{ url: string; metadata: Record<string, unknown> }> {
    return {
      url: 'https://placeholder.example.com/thumbnail.png',
      metadata: { prompt, style, mock: true },
    };
  }
}
