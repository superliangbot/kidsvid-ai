import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VeoVideoProvider,
  NanoBananaVideoProvider,
  MockVideoProvider,
  RunwayVideoProvider,
  KlingVideoProvider,
  SoraVideoProvider,
  createVideoProvider,
} from './video.js';

// Mock @google/genai
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateVideos: vi.fn().mockResolvedValue({
          done: true,
          response: {
            generatedVideos: [
              { video: { uri: 'https://storage.googleapis.com/veo/video123.mp4' } },
            ],
          },
        }),
      },
      operations: {
        getVideosOperation: vi.fn(),
      },
    })),
  };
});

describe('VeoVideoProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs with defaults', () => {
    const provider = new VeoVideoProvider({ apiKey: 'test-key' });
    expect(provider).toBeDefined();
  });

  it('generates video via Gemini API', async () => {
    const provider = new VeoVideoProvider({ apiKey: 'test-key' });
    const result = await provider.generate('A colorful counting animation', 8);

    expect(result.videoUrl).toContain('storage.googleapis.com');
    expect(result.duration).toBe(8);
  });

  it('clamps duration to valid Veo values', async () => {
    const provider = new VeoVideoProvider({ apiKey: 'test-key' });

    const result4 = await provider.generate('Short clip', 3);
    expect(result4.duration).toBe(4);

    const result6 = await provider.generate('Medium clip', 6);
    expect(result6.duration).toBe(6);

    const result8 = await provider.generate('Long clip', 10);
    expect(result8.duration).toBe(8);
  });

  it('throws on timeout', async () => {
    const { GoogleGenAI } = await import('@google/genai');
    vi.mocked(GoogleGenAI).mockImplementation(() => ({
      models: {
        generateVideos: vi.fn().mockResolvedValue({ done: false }),
      },
      operations: {
        getVideosOperation: vi.fn().mockResolvedValue({ done: false }),
      },
    }) as unknown as InstanceType<typeof GoogleGenAI>);

    const provider = new VeoVideoProvider({
      apiKey: 'test-key',
      pollIntervalMs: 1,
      maxPollAttempts: 2,
    });

    await expect(provider.generate('Test', 8)).rejects.toThrow('timed out');
  });

  it('throws when no videos returned', async () => {
    const { GoogleGenAI } = await import('@google/genai');
    vi.mocked(GoogleGenAI).mockImplementation(() => ({
      models: {
        generateVideos: vi.fn().mockResolvedValue({
          done: true,
          response: { generatedVideos: [] },
        }),
      },
      operations: {
        getVideosOperation: vi.fn(),
      },
    }) as unknown as InstanceType<typeof GoogleGenAI>);

    const provider = new VeoVideoProvider({ apiKey: 'test-key' });
    await expect(provider.generate('Test', 8)).rejects.toThrow('no generated videos');
  });
});

describe('NanoBananaVideoProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs with defaults', () => {
    const provider = new NanoBananaVideoProvider({ apiKey: 'test-key' });
    expect(provider).toBeDefined();
  });

  it('calls Nano Banana API and returns result', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        video_url: 'https://cdn.nanobanana.com/video/abc123.mp4',
        duration: 6,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new NanoBananaVideoProvider({ apiKey: 'test-key' });
    const result = await provider.generate('Colorful shapes dancing', 6);

    expect(result.videoUrl).toContain('nanobanana.com');
    expect(result.duration).toBe(6);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.nanobanana.com/v1/generate',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on API error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limited'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new NanoBananaVideoProvider({ apiKey: 'test-key' });
    await expect(provider.generate('Test', 5)).rejects.toThrow('Nano Banana API error 429');
  });

  it('caps duration at 10 seconds', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ video_url: 'https://example.com/v.mp4', duration: 10 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new NanoBananaVideoProvider({ apiKey: 'test-key' });
    await provider.generate('Long clip', 30);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.duration_seconds).toBe(10);
  });
});

describe('MockVideoProvider', () => {
  it('returns mock video URL', async () => {
    const provider = new MockVideoProvider();
    const result = await provider.generate('Test prompt', 5);

    expect(result.videoUrl).toContain('mock://video/');
    expect(result.duration).toBe(5);
  });
});

describe('Scaffold providers throw', () => {
  it('RunwayVideoProvider throws not implemented', async () => {
    const provider = new RunwayVideoProvider('key');
    await expect(provider.generate('test', 5)).rejects.toThrow('not yet implemented');
  });

  it('KlingVideoProvider throws not implemented', async () => {
    const provider = new KlingVideoProvider('key');
    await expect(provider.generate('test', 5)).rejects.toThrow('not yet implemented');
  });

  it('SoraVideoProvider throws not implemented', async () => {
    const provider = new SoraVideoProvider('key');
    await expect(provider.generate('test', 5)).rejects.toThrow('not yet implemented');
  });
});

describe('createVideoProvider', () => {
  it('creates VeoVideoProvider for "veo"', () => {
    const provider = createVideoProvider('veo', 'key');
    expect(provider).toBeInstanceOf(VeoVideoProvider);
  });

  it('creates NanoBananaVideoProvider for "nanobanana"', () => {
    const provider = createVideoProvider('nanobanana', 'key');
    expect(provider).toBeInstanceOf(NanoBananaVideoProvider);
  });

  it('creates RunwayVideoProvider for "runway"', () => {
    const provider = createVideoProvider('runway', 'key');
    expect(provider).toBeInstanceOf(RunwayVideoProvider);
  });

  it('throws for unknown provider', () => {
    expect(() => createVideoProvider('unknown' as 'veo', 'key')).toThrow('Unknown video provider');
  });
});
