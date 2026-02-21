import type { MusicProvider } from '@kidsvid/shared';

/** Suno music generation provider (scaffold) */

export class SunoMusicProvider implements MusicProvider {
  constructor(private apiKey: string) {}

  async generate(
    prompt: string,
    duration: number,
  ): Promise<{ audioUrl: string; duration: number }> {
    // Suno API scaffold — API is evolving, implement when stable
    // Expected flow:
    // 1. POST /v1/generation with prompt + style
    // 2. Poll for completion
    // 3. Return audio URL

    throw new Error(
      'Suno provider not yet implemented. Use MockMusicProvider for development.',
    );
  }
}

/** Mock provider for development */
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
