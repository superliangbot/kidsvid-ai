import { describe, it, expect } from 'vitest';
import { detectPatterns, type PatternDetectorInput } from './patterns.js';
import { categorizeVideo } from './categorizer.js';
import type { YouTubeVideoInfo } from '@kidsvid/shared';

function makeVideo(overrides: Partial<YouTubeVideoInfo> = {}): YouTubeVideoInfo {
  return {
    videoId: 'test-' + Math.random().toString(36).slice(2, 8),
    channelId: 'UC_test',
    title: 'Test Kids Video',
    description: 'A fun kids video',
    publishedAt: '2024-06-15T14:00:00Z',
    duration: 200,
    viewCount: 500000,
    likeCount: 10000,
    commentCount: 1000,
    tags: ['kids', 'children', 'fun'],
    thumbnailUrl: 'https://example.com/thumb.jpg',
    defaultLanguage: 'en',
    categoryId: '24',
    ...overrides,
  };
}

function makeInput(videos: YouTubeVideoInfo[]): PatternDetectorInput {
  const categories = new Map<string, ReturnType<typeof categorizeVideo>>();
  for (const v of videos) {
    categories.set(v.videoId, categorizeVideo(v));
  }
  return { videos, categories };
}

describe('detectPatterns', () => {
  it('returns empty array for no videos', () => {
    const result = detectPatterns({ videos: [], categories: new Map() });
    expect(result).toEqual([]);
  });

  it('detects title length patterns', () => {
    const videos = Array.from({ length: 20 }, (_, i) =>
      makeVideo({
        videoId: `v${i}`,
        title: i < 10 ? 'Short Title' : 'This is a much longer title that has many words in it and stuff',
        viewCount: i < 10 ? 1000000 : 500000,
      }),
    );
    const result = detectPatterns(makeInput(videos));
    const titlePattern = result.find((p) => p.patternType === 'title_length' && !p.category);
    expect(titlePattern).toBeDefined();
    expect(titlePattern!.sampleSize).toBe(20);
    expect(titlePattern!.metadata.avgLength).toBeGreaterThan(0);
  });

  it('detects emoji usage in titles', () => {
    const videos = Array.from({ length: 20 }, (_, i) =>
      makeVideo({
        videoId: `v${i}`,
        title: i < 8 ? '🎉 Fun Video for Kids!' : 'Fun Video for Kids',
        viewCount: 100000 + i * 10000,
      }),
    );
    const result = detectPatterns(makeInput(videos));
    const emojiPattern = result.find((p) => p.patternType === 'title_emoji');
    expect(emojiPattern).toBeDefined();
    expect(emojiPattern!.metadata.emojiCount).toBe(8);
  });

  it('detects number usage in titles', () => {
    const videos = Array.from({ length: 20 }, (_, i) =>
      makeVideo({
        videoId: `v${i}`,
        title: i < 10 ? `Top 10 Kids Songs #${i}` : 'Kids Songs Compilation',
        viewCount: 100000,
      }),
    );
    const result = detectPatterns(makeInput(videos));
    const numPattern = result.find((p) => p.patternType === 'title_numbers');
    expect(numPattern).toBeDefined();
    expect(numPattern!.metadata.count).toBe(10);
  });

  it('detects duration patterns', () => {
    const videos = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeVideo({ videoId: `short${i}`, duration: 60, viewCount: 200000 }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        makeVideo({ videoId: `med${i}`, duration: 200, viewCount: 800000 }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeVideo({ videoId: `long${i}`, duration: 500, viewCount: 400000 }),
      ),
    ];
    const result = detectPatterns(makeInput(videos));
    const durPattern = result.find((p) => p.patternType === 'duration' && !p.category);
    expect(durPattern).toBeDefined();
    expect(durPattern!.metadata.buckets).toBeDefined();

    const optimalPattern = result.find((p) => p.patternType === 'duration_optimal');
    expect(optimalPattern).toBeDefined();
    expect(optimalPattern!.finding).toContain('medium');
  });

  it('detects upload day patterns', () => {
    // Create videos on different days
    const videos = Array.from({ length: 30 }, (_, i) => {
      const date = new Date('2024-06-01T12:00:00Z');
      date.setDate(date.getDate() + i);
      return makeVideo({
        videoId: `v${i}`,
        publishedAt: date.toISOString(),
        viewCount: date.getUTCDay() === 2 ? 1000000 : 200000, // Tuesdays do best
      });
    });
    const result = detectPatterns(makeInput(videos));
    const dayPattern = result.find((p) => p.patternType === 'upload_day');
    expect(dayPattern).toBeDefined();
    expect(dayPattern!.metadata.dayStats).toBeDefined();
  });

  it('detects upload frequency', () => {
    const videos = Array.from({ length: 20 }, (_, i) => {
      const date = new Date('2024-06-01T12:00:00Z');
      date.setDate(date.getDate() + i * 2); // every 2 days
      return makeVideo({ videoId: `v${i}`, publishedAt: date.toISOString() });
    });
    const result = detectPatterns(makeInput(videos));
    const freqPattern = result.find((p) => p.patternType === 'upload_frequency');
    expect(freqPattern).toBeDefined();
    // ~3.5 videos/week (every 2 days)
    const freq = freqPattern!.metadata.videosPerWeek as number;
    expect(freq).toBeGreaterThan(2);
    expect(freq).toBeLessThan(5);
  });

  it('detects popular tags', () => {
    const videos = Array.from({ length: 15 }, (_, i) =>
      makeVideo({
        videoId: `v${i}`,
        tags: ['kids', 'nursery rhymes', 'songs for children', `unique-tag-${i}`],
      }),
    );
    const result = detectPatterns(makeInput(videos));
    const tagPattern = result.find((p) => p.patternType === 'tags_popular' && !p.category);
    expect(tagPattern).toBeDefined();
    expect(tagPattern!.finding).toContain('kids');
  });

  it('detects high performing tags', () => {
    const videos = [
      ...Array.from({ length: 8 }, (_, i) =>
        makeVideo({
          videoId: `high${i}`,
          tags: ['magic-tag', 'kids'],
          viewCount: 5000000,
        }),
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        makeVideo({
          videoId: `low${i}`,
          tags: ['boring-tag', 'kids'],
          viewCount: 100000,
        }),
      ),
    ];
    const result = detectPatterns(makeInput(videos));
    const highPerfPattern = result.find((p) => p.patternType === 'tags_high_performing');
    expect(highPerfPattern).toBeDefined();
  });

  it('detects average tag count', () => {
    const videos = Array.from({ length: 10 }, (_, i) =>
      makeVideo({
        videoId: `v${i}`,
        tags: Array.from({ length: 10 + i }, (_, j) => `tag-${j}`),
      }),
    );
    const result = detectPatterns(makeInput(videos));
    const countPattern = result.find((p) => p.patternType === 'tags_count');
    expect(countPattern).toBeDefined();
    expect(countPattern!.metadata.avgTagCount).toBeGreaterThan(10);
  });

  it('detects engagement rate', () => {
    const videos = Array.from({ length: 10 }, (_, i) =>
      makeVideo({
        videoId: `v${i}`,
        viewCount: 1000000,
        likeCount: 50000,
        commentCount: 5000,
      }),
    );
    const result = detectPatterns(makeInput(videos));
    const engPattern = result.find((p) => p.patternType === 'engagement_rate' && !p.category);
    expect(engPattern).toBeDefined();
    expect(engPattern!.finding).toContain('%');
  });

  it('detects per-category patterns when enough data', () => {
    const videos = [
      ...Array.from({ length: 10 }, (_, i) =>
        makeVideo({
          videoId: `edu${i}`,
          title: 'Learn Colors and Numbers',
          tags: ['educational', 'learning'],
          duration: 180,
          viewCount: 500000,
        }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        makeVideo({
          videoId: `song${i}`,
          title: 'Baby Shark Song for Kids',
          tags: ['kids songs', 'sing along'],
          duration: 240,
          viewCount: 2000000,
        }),
      ),
    ];
    const result = detectPatterns(makeInput(videos));

    // Should have per-category findings
    const catFindings = result.filter((p) => p.category !== null);
    expect(catFindings.length).toBeGreaterThan(0);
  });

  it('handles videos with zero views gracefully', () => {
    const videos = Array.from({ length: 10 }, (_, i) =>
      makeVideo({ videoId: `v${i}`, viewCount: 0, likeCount: 0, commentCount: 0 }),
    );
    const result = detectPatterns(makeInput(videos));
    // Should not throw, should still produce patterns
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles videos with missing dates', () => {
    const videos = Array.from({ length: 10 }, (_, i) =>
      makeVideo({ videoId: `v${i}`, publishedAt: '' }),
    );
    const result = detectPatterns(makeInput(videos));
    // Should not crash, upload time patterns may be empty
    expect(Array.isArray(result)).toBe(true);
  });
});
