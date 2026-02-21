import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScriptGenerator } from './script-generator.js';
import type { ScriptRequest, Logger } from '@kidsvid/shared';

// Mock logger
const mockLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
} as unknown as Logger;

function makeRequest(overrides: Partial<ScriptRequest> = {}): ScriptRequest {
  return {
    category: 'educational',
    educationalCategory: 'early_math',
    educationalObjective: 'Learn to count from 1 to 5',
    engagementHooks: ['call_response', 'reward_loop', 'mystery_reveal', 'direct_address'],
    targetDuration: 150,
    ageBracket: '2-4',
    characterIds: [0],
    topic: 'Counting apples',
    ...overrides,
  };
}

// Mock LLM response
const MOCK_LLM_RESPONSE = JSON.stringify({
  title: 'Count to 5 with Cosmo!',
  description: 'Join Cosmo the robot as he learns to count from 1 to 5 with colorful apples.',
  script: `[Cosmo bounces in] "Hey friends! Let's count together! Can you count with me?"
[Five apples appear] "One apple, two apples, three apples!"
"That's right! Can you name the color? Yes, they're red!"
[Stars appear] "Let's try with stars: one, two, three, four, five!"
"Do you know what? Let's count one more time! 1, 2, 3, 4, 5!"
[Confetti] "You did it! We learned to count to 5!"`,
  tags: ['counting', 'numbers', 'kids', 'educational'],
  estimatedDuration: 150,
  educationalObjective: 'Learn to count objects from 1 to 5',
  learningTakeaways: ['Count from 1 to 5', 'Match numbers to quantities'],
  engagementHooks: ['call_response', 'reward_loop', 'mystery_reveal', 'direct_address'],
  episodeStructure: {
    hook: { duration: 15, description: 'Cosmo discovers apples falling from a tree' },
    problem: { duration: 30, description: 'How many apples fell? Let us count!' },
    exploration: { duration: 120, description: 'Count together using apples, then stars, then fingers, and learn numbers' },
    resolution: { duration: 30, description: 'Celebration! We learned to count to 5!' },
    nextPreview: { duration: 15, description: 'Next time: shapes! Can you find a circle?' },
  },
});

describe('ScriptGenerator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('constructs with default model and retries', () => {
    const gen = new ScriptGenerator(
      { anthropicApiKey: 'test-key' },
      mockLogger,
    );
    expect(gen).toBeDefined();
  });

  it('generates a script from a valid LLM response', async () => {
    // Mock the fetch call
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: MOCK_LLM_RESPONSE }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const gen = new ScriptGenerator(
      { anthropicApiKey: 'test-key', maxRetries: 0 },
      mockLogger,
    );

    const result = await gen.generate(makeRequest());

    expect(result.title).toBe('Count to 5 with Cosmo!');
    expect(result.script).toContain('count');
    expect(result.learningTakeaways.length).toBeGreaterThanOrEqual(1);
    expect(result.engagementHooks).toContain('call_response');
    expect(result.qualityScore).toBeDefined();
  });

  it('sends request to Anthropic API with correct format', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: MOCK_LLM_RESPONSE }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const gen = new ScriptGenerator(
      { anthropicApiKey: 'test-key', model: 'claude-sonnet-4-5-20250929', maxRetries: 0 },
      mockLogger,
    );

    await gen.generate(makeRequest());

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-key',
          'anthropic-version': '2023-06-01',
        }),
      }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('claude-sonnet-4-5-20250929');
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content).toContain('early_math');
    expect(body.messages[0].content).toContain('Counting apples');
    expect(body.messages[0].content).toContain('2-4');
  });

  it('includes character descriptions in prompt', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: MOCK_LLM_RESPONSE }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const gen = new ScriptGenerator(
      { anthropicApiKey: 'test-key', maxRetries: 0 },
      mockLogger,
    );

    await gen.generate(makeRequest({ characterIds: [0] }));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('Cosmo');
  });

  it('includes engagement hook descriptions in prompt', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: MOCK_LLM_RESPONSE }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const gen = new ScriptGenerator(
      { anthropicApiKey: 'test-key', maxRetries: 0 },
      mockLogger,
    );

    await gen.generate(makeRequest());

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('Call and Response');
    expect(body.messages[0].content).toContain('Reward Loop');
  });

  it('handles malformed LLM response gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: 'This is not JSON at all, just plain text about counting.' }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const gen = new ScriptGenerator(
      { anthropicApiKey: 'test-key', maxRetries: 0 },
      mockLogger,
    );

    const result = await gen.generate(makeRequest());

    // Should fall back gracefully
    expect(result.title).toBe('Generated Script');
    expect(result.script).toContain('counting');
    expect(result.qualityScore.passed).toBe(false);
  });

  it('handles API error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limited'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const gen = new ScriptGenerator(
      { anthropicApiKey: 'test-key', maxRetries: 0 },
      mockLogger,
    );

    await expect(gen.generate(makeRequest())).rejects.toThrow('Anthropic API error 429');
  });

  it('retries with quality feedback when score is too low', async () => {
    // First response: no learning takeaways (will fail quality)
    const badResponse = JSON.stringify({
      title: 'Fun Video',
      description: 'A fun video',
      script: 'Something happens.',
      tags: [],
      estimatedDuration: 150,
      educationalObjective: 'Learn counting',
      learningTakeaways: [],
      engagementHooks: ['call_response', 'reward_loop'],
      episodeStructure: {
        hook: { duration: 15, description: 'Start' },
        problem: { duration: 30, description: 'Problem' },
        exploration: { duration: 120, description: 'Explore and learn numbers together' },
        resolution: { duration: 30, description: 'Done, we learned something' },
        nextPreview: { duration: 15, description: 'Next' },
      },
    });

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      const response = callCount === 1 ? badResponse : MOCK_LLM_RESPONSE;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: response }],
        }),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const gen = new ScriptGenerator(
      { anthropicApiKey: 'test-key', maxRetries: 1 },
      mockLogger,
    );

    const result = await gen.generate(makeRequest());

    // Should have made 2 API calls
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Second call should include feedback in prompt
    const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondBody.messages[0].content).toContain('Previous attempt scored too low');
  });

  it('extracts JSON from markdown code blocks', async () => {
    const wrappedResponse = '```json\n' + MOCK_LLM_RESPONSE + '\n```';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: wrappedResponse }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const gen = new ScriptGenerator(
      { anthropicApiKey: 'test-key', maxRetries: 0 },
      mockLogger,
    );

    const result = await gen.generate(makeRequest());
    expect(result.title).toBe('Count to 5 with Cosmo!');
  });
});
