import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GeminiMusicProvider,
  SunoMusicProvider,
  MockMusicProvider,
  createMusicProvider,
} from './music.js';

// Mock @google/genai
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'audio/wav',
                      data: 'base64audiodata...',
                    },
                  },
                ],
              },
            },
          ],
        }),
      },
    })),
  };
});

describe('GeminiMusicProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs with defaults', () => {
    const provider = new GeminiMusicProvider({ apiKey: 'test-key' });
    expect(provider).toBeDefined();
  });

  it('generates music via Gemini API', async () => {
    const provider = new GeminiMusicProvider({ apiKey: 'test-key' });
    const result = await provider.generate('Happy counting song for toddlers', 30);

    expect(result.audioUrl).toContain('gemini-music://');
    expect(result.duration).toBe(30);
  });

  it('throws when no audio content returned', async () => {
    const { GoogleGenAI } = await import('@google/genai');
    vi.mocked(GoogleGenAI).mockImplementation(() => ({
      models: {
        generateContent: vi.fn().mockResolvedValue({
          candidates: [{ content: { parts: [] } }],
        }),
      },
    }) as unknown as InstanceType<typeof GoogleGenAI>);

    const provider = new GeminiMusicProvider({ apiKey: 'test-key' });
    await expect(provider.generate('Test', 10)).rejects.toThrow('no audio content');
  });

  it('throws when response has no inline data', async () => {
    const { GoogleGenAI } = await import('@google/genai');
    vi.mocked(GoogleGenAI).mockImplementation(() => ({
      models: {
        generateContent: vi.fn().mockResolvedValue({
          candidates: [{ content: { parts: [{ text: 'no audio here' }] } }],
        }),
      },
    }) as unknown as InstanceType<typeof GoogleGenAI>);

    const provider = new GeminiMusicProvider({ apiKey: 'test-key' });
    await expect(provider.generate('Test', 10)).rejects.toThrow('no audio data');
  });

  it('uses custom model', async () => {
    const { GoogleGenAI } = await import('@google/genai');
    vi.mocked(GoogleGenAI).mockImplementation(() => ({
      models: {
        generateContent: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: 'audio/wav', data: 'audio...' } }],
              },
            },
          ],
        }),
      },
    }) as unknown as InstanceType<typeof GoogleGenAI>);

    const provider = new GeminiMusicProvider({
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
    });
    const result = await provider.generate('Background music', 60);
    expect(result.audioUrl).toContain('gemini-2.0-flash');
  });
});

describe('SunoMusicProvider', () => {
  it('throws not implemented', async () => {
    const provider = new SunoMusicProvider('test-key');
    await expect(provider.generate('Test', 10)).rejects.toThrow('not yet implemented');
  });
});

describe('MockMusicProvider', () => {
  it('returns mock audio URL', async () => {
    const provider = new MockMusicProvider();
    const result = await provider.generate('Happy song', 30);

    expect(result.audioUrl).toContain('mock://music/');
    expect(result.duration).toBe(30);
  });
});

describe('createMusicProvider', () => {
  it('creates GeminiMusicProvider for "gemini"', () => {
    const provider = createMusicProvider('gemini', 'key');
    expect(provider).toBeInstanceOf(GeminiMusicProvider);
  });

  it('creates SunoMusicProvider for "suno"', () => {
    const provider = createMusicProvider('suno', 'key');
    expect(provider).toBeInstanceOf(SunoMusicProvider);
  });

  it('throws for unknown provider', () => {
    expect(() => createMusicProvider('unknown' as 'gemini', 'key')).toThrow('Unknown music provider');
  });
});
