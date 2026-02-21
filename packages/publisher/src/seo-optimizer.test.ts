import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeoOptimizer } from './seo-optimizer.js';
import type { Logger } from '@kidsvid/shared';

// Mock fs for analysis-results.json loading
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue(JSON.stringify({
    patterns: [
      {
        patternType: 'title_keywords',
        metadata: {
          topWords: [
            { word: 'kids' },
            { word: 'super' },
            { word: 'songs' },
            { word: 'fun' },
            { word: 'learn' },
          ],
        },
      },
      {
        patternType: 'tags_high_performing',
        metadata: {
          highPerformingTags: [
            { tag: 'for kids', count: 75, avgViews: 7822520 },
            { tag: 'kids toys', count: 32, avgViews: 10509458 },
            { tag: 'learn', count: 33, avgViews: 10138661 },
          ],
        },
      },
      {
        patternType: 'tags_popular',
        metadata: {
          topTags: [
            { tag: 'nursery rhymes', count: 108, avgViews: 2563266 },
            { tag: 'kids', count: 92, avgViews: 4167602 },
          ],
        },
      },
      {
        patternType: 'engagement_rate',
        metadata: { avgEngagementRate: 0.004 },
      },
      {
        patternType: 'title_length',
        metadata: { avgLength: 63 },
      },
    ],
  })),
}));

const mockLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

describe('SeoOptimizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs and loads analysis patterns', () => {
    const optimizer = new SeoOptimizer(mockLogger);
    expect(optimizer).toBeDefined();
  });

  it('truncates long titles to 60 chars', () => {
    const optimizer = new SeoOptimizer(mockLogger);
    const result = optimizer.optimize({
      title: 'This is a very long title that exceeds the sixty character limit for YouTube videos definitely',
      description: 'Test desc',
      tags: ['test'],
      category: 'educational',
    });

    expect(result.title.length).toBeLessThanOrEqual(60);
    expect(result.changes).toContain('Truncated title to 60 chars');
  });

  it('adds exclamation if no engagement markers', () => {
    const optimizer = new SeoOptimizer(mockLogger);
    const result = optimizer.optimize({
      title: 'Learn Colors with Cosmo',
      description: 'Test',
      tags: [],
      category: 'educational',
    });

    expect(result.title).toBe('Learn Colors with Cosmo!');
    expect(result.changes).toContain('Added exclamation to title');
  });

  it('does not add exclamation if title has punctuation', () => {
    const optimizer = new SeoOptimizer(mockLogger);
    const result = optimizer.optimize({
      title: 'Can You Count to 10?',
      description: 'Test',
      tags: [],
      category: 'educational',
    });

    expect(result.title).toBe('Can You Count to 10?');
  });

  it('does not add exclamation if title has numbers', () => {
    const optimizer = new SeoOptimizer(mockLogger);
    const result = optimizer.optimize({
      title: 'Learn 5 Colors Today',
      description: 'Test',
      tags: [],
      category: 'educational',
    });

    expect(result.title).toBe('Learn 5 Colors Today');
  });

  it('adds hashtags and CTA to description', () => {
    const optimizer = new SeoOptimizer(mockLogger);
    const result = optimizer.optimize({
      title: 'Test!',
      description: 'Learn counting.',
      tags: [],
      category: 'educational',
    });

    expect(result.description).toContain('#kids');
    expect(result.description).toContain('#educational');
    expect(result.description).toContain('Subscribe');
  });

  it('merges base tags and high-performing tags', () => {
    const optimizer = new SeoOptimizer(mockLogger);
    const result = optimizer.optimize({
      title: 'Test!',
      description: 'Test',
      tags: ['custom-tag'],
      category: 'educational',
    });

    expect(result.tags).toContain('custom-tag');
    expect(result.tags).toContain('kids');
    expect(result.tags).toContain('educational');
    expect(result.tags).toContain('for kids');
    expect(result.tags.length).toBeGreaterThan(5);
  });

  it('adds category-specific tags', () => {
    const optimizer = new SeoOptimizer(mockLogger);

    const songResult = optimizer.optimize({
      title: 'Test!',
      description: 'Test',
      tags: [],
      category: 'song',
    });
    expect(songResult.tags).toContain('kids songs');

    const storyResult = optimizer.optimize({
      title: 'Test!',
      description: 'Test',
      tags: [],
      category: 'story',
    });
    expect(storyResult.tags).toContain('kids stories');
  });

  it('respects 500-char tag limit', () => {
    const optimizer = new SeoOptimizer(mockLogger);
    const longTags = Array.from({ length: 100 }, (_, i) => `very-long-tag-name-${i}`);

    const result = optimizer.optimize({
      title: 'Test!',
      description: 'Test',
      tags: longTags,
      category: 'educational',
    });

    const totalChars = result.tags.reduce((s, t) => s + t.length + 1, 0);
    expect(totalChars).toBeLessThanOrEqual(501); // +1 for each separator
  });

  it('suggests missing high-performing keywords', () => {
    const optimizer = new SeoOptimizer(mockLogger);
    const result = optimizer.optimize({
      title: 'Boring Title Here',
      description: 'Test',
      tags: [],
      category: 'educational',
    });

    const keywordSuggestion = result.changes.find((c) => c.includes('Consider adding'));
    expect(keywordSuggestion).toBeDefined();
  });

  it('returns optimal posting insights', () => {
    const optimizer = new SeoOptimizer(mockLogger);
    const insights = optimizer.getOptimalPostingInsights();

    expect(insights.bestDays).toContain('Tuesday');
    expect(insights.bestHoursUtc).toContain(14);
    expect(insights.avgEngagementRate).toBeGreaterThan(0);
  });
});
