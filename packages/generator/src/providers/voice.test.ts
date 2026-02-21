import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OpenAITTSProvider,
  MockVoiceProvider,
  OPENAI_VOICES,
  CHARACTER_VOICE_MAP,
} from './voice.js';

describe('OpenAITTSProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('constructs with defaults', () => {
    const provider = new OpenAITTSProvider({ apiKey: 'test-key' });
    expect(provider).toBeDefined();
  });

  it('calls OpenAI TTS API with correct parameters', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new OpenAITTSProvider({
      apiKey: 'test-key',
      model: 'tts-1-hd',
      defaultVoice: 'shimmer',
      speed: 0.85,
    });

    await provider.generate('Hello kids! Let us count to five!');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/speech',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
      }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('tts-1-hd');
    expect(body.voice).toBe('shimmer');
    expect(body.speed).toBe(0.85);
    expect(body.input).toContain('Hello kids');
  });

  it('uses specified voiceId over default', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(512)),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new OpenAITTSProvider({
      apiKey: 'test-key',
      defaultVoice: 'nova',
    });

    await provider.generate('Count with me!', 'fable');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voice).toBe('fable');
  });

  it('returns audio URL and estimated duration', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(2048)),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new OpenAITTSProvider({ apiKey: 'test-key' });
    const result = await provider.generate('One two three four five.');

    expect(result.audioUrl).toContain('openai-tts://');
    expect(result.audioUrl).toContain('nova');
    expect(result.duration).toBeGreaterThan(0);
  });

  it('throws on API error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Invalid API key'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new OpenAITTSProvider({ apiKey: 'bad-key' });
    await expect(provider.generate('Hello')).rejects.toThrow('OpenAI TTS API error 401');
  });

  it('lists all 6 OpenAI voices', async () => {
    const provider = new OpenAITTSProvider({ apiKey: 'test-key' });
    const voices = await provider.listVoices();

    expect(voices).toHaveLength(6);
    expect(voices.map((v) => v.id)).toEqual(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);
  });

  it('generates buffer with correct content type', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(4096)),
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new OpenAITTSProvider({ apiKey: 'test-key' });
    const result = await provider.generateBuffer('Hello kids!');

    expect(result.buffer.byteLength).toBe(4096);
    expect(result.contentType).toBe('audio/mpeg');
    expect(result.duration).toBeGreaterThan(0);
  });
});

describe('MockVoiceProvider', () => {
  it('returns mock audio URL', async () => {
    const provider = new MockVoiceProvider();
    const result = await provider.generate('Hello kids!', 'shimmer');

    expect(result.audioUrl).toContain('mock://voice/shimmer/');
    expect(result.duration).toBeGreaterThan(0);
  });

  it('defaults voice to nova when not specified', async () => {
    const provider = new MockVoiceProvider();
    const result = await provider.generate('Hello');

    expect(result.audioUrl).toContain('nova');
  });

  it('lists OpenAI voices', async () => {
    const provider = new MockVoiceProvider();
    const voices = await provider.listVoices();

    expect(voices).toHaveLength(6);
    expect(voices[0].id).toBe('alloy');
  });

  it('estimates duration based on word count', async () => {
    const provider = new MockVoiceProvider();
    const short = await provider.generate('Hello');
    const long = await provider.generate('This is a much longer sentence with many more words in it for testing');

    expect(long.duration).toBeGreaterThan(short.duration);
  });
});

describe('OPENAI_VOICES', () => {
  it('has 6 voices', () => {
    expect(OPENAI_VOICES).toHaveLength(6);
  });

  it('includes nova and shimmer (best for kids)', () => {
    const ids = OPENAI_VOICES.map((v) => v.id);
    expect(ids).toContain('nova');
    expect(ids).toContain('shimmer');
  });
});

describe('CHARACTER_VOICE_MAP', () => {
  it('maps all default characters to voices', () => {
    expect(CHARACTER_VOICE_MAP['Cosmo']).toBe('nova');
    expect(CHARACTER_VOICE_MAP['Melody']).toBe('shimmer');
    expect(CHARACTER_VOICE_MAP['Professor Paws']).toBe('fable');
    expect(CHARACTER_VOICE_MAP['Brave Bea']).toBe('alloy');
    expect(CHARACTER_VOICE_MAP['Pixel & Dot']).toBe('echo');
  });

  it('has a narrator default', () => {
    expect(CHARACTER_VOICE_MAP['narrator']).toBe('nova');
  });
});
