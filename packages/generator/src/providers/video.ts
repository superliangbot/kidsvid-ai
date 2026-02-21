import type { VideoProvider } from '@kidsvid/shared';

/** Video generation provider interface.
 * Supports Runway, Kling, and Sora as backends — swap via config. */

export class RunwayVideoProvider implements VideoProvider {
  constructor(private apiKey: string) {}

  async generate(
    prompt: string,
    duration: number,
  ): Promise<{ videoUrl: string; duration: number }> {
    // Runway Gen-3 API scaffold
    // Expected flow:
    // 1. POST /v1/generations with prompt, duration, aspect ratio
    // 2. Poll task status
    // 3. Return video URL on completion
    throw new Error(
      'Runway provider not yet implemented. Use MockVideoProvider for development.',
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
      'Kling provider not yet implemented. Use MockVideoProvider for development.',
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
      'Sora provider not yet implemented. Use MockVideoProvider for development.',
    );
  }
}

/** Mock provider for development */
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

/** Factory to create the configured video provider */
export function createVideoProvider(
  provider: 'runway' | 'kling' | 'sora',
  apiKey: string,
): VideoProvider {
  switch (provider) {
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
