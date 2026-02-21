import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrategyScorer } from './scorer.js';
import type { Logger } from '@kidsvid/shared';
import type { Database } from '@kidsvid/shared';

const mockLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

function createMockDb(options?: {
  publishedVideos?: Array<Record<string, unknown>>;
  snapshots?: Array<Record<string, unknown>>;
  strategies?: Array<Record<string, unknown>>;
}) {
  return {
    query: {
      generatedVideos: {
        findMany: vi.fn().mockResolvedValue(options?.publishedVideos ?? []),
      },
      performanceSnapshots: {
        findMany: vi.fn().mockResolvedValue(options?.snapshots ?? []),
      },
      strategyScores: {
        findMany: vi.fn().mockResolvedValue(options?.strategies ?? []),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  } as unknown as Database;
}

describe('StrategyScorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('evaluate', () => {
    it('scores strategy at 1.0 when matching benchmark', () => {
      const db = createMockDb();
      const scorer = new StrategyScorer(db, mockLogger);

      const result = scorer.evaluate({
        strategy: 'category:educational',
        category: 'educational',
        videoIds: ['v1', 'v2'],
        avgViews: 10000,
        avgEngagement: 0.005,
        benchmarkViews: 10000,
        benchmarkEngagement: 0.005,
      });

      expect(result.score).toBe(1);
      expect(result.sampleSize).toBe(2);
    });

    it('scores above 1.0 when outperforming benchmark', () => {
      const db = createMockDb();
      const scorer = new StrategyScorer(db, mockLogger);

      const result = scorer.evaluate({
        strategy: 'category:song',
        category: 'song',
        videoIds: ['v1'],
        avgViews: 20000,
        avgEngagement: 0.01,
        benchmarkViews: 10000,
        benchmarkEngagement: 0.005,
      });

      expect(result.score).toBe(2);
    });

    it('scores below 1.0 when underperforming', () => {
      const db = createMockDb();
      const scorer = new StrategyScorer(db, mockLogger);

      const result = scorer.evaluate({
        strategy: 'category:unboxing',
        category: 'unboxing',
        videoIds: ['v1'],
        avgViews: 5000,
        avgEngagement: 0.002,
        benchmarkViews: 10000,
        benchmarkEngagement: 0.005,
      });

      expect(result.score).toBeLessThan(1);
    });

    it('handles zero benchmark gracefully', () => {
      const db = createMockDb();
      const scorer = new StrategyScorer(db, mockLogger);

      const result = scorer.evaluate({
        strategy: 'test',
        category: null,
        videoIds: [],
        avgViews: 1000,
        avgEngagement: 0.01,
        benchmarkViews: 0,
        benchmarkEngagement: 0,
      });

      expect(result.score).toBe(0);
    });
  });

  describe('scoreAllDimensions', () => {
    it('returns empty when no published videos', async () => {
      const db = createMockDb({ publishedVideos: [] });
      const scorer = new StrategyScorer(db, mockLogger);

      const result = await scorer.scoreAllDimensions({
        avgViews: 10000,
        avgEngagement: 0.005,
      });

      expect(result).toEqual([]);
    });

    it('scores across multiple dimensions', async () => {
      const db = createMockDb({
        publishedVideos: [
          {
            youtubeVideoId: 'yt-1',
            category: 'educational',
            targetDuration: 180,
            targetAgeMin: 4,
            targetAgeMax: 6,
            publishedAt: new Date('2026-02-18T14:00:00Z'), // Wednesday
          },
          {
            youtubeVideoId: 'yt-2',
            category: 'song',
            targetDuration: 120,
            targetAgeMin: 2,
            targetAgeMax: 4,
            publishedAt: new Date('2026-02-19T15:00:00Z'), // Thursday
          },
        ],
        snapshots: [
          { youtubeVideoId: 'yt-1', viewCount: 15000, likeCount: 750, snapshotAt: new Date() },
          { youtubeVideoId: 'yt-2', viewCount: 8000, likeCount: 300, snapshotAt: new Date() },
        ],
      });

      const scorer = new StrategyScorer(db, mockLogger);
      const dimensions = await scorer.scoreAllDimensions({
        avgViews: 10000,
        avgEngagement: 0.005,
      });

      expect(dimensions.length).toBeGreaterThanOrEqual(4);

      const categoryDim = dimensions.find((d) => d.dimension === 'category');
      expect(categoryDim).toBeDefined();
      expect(categoryDim!.strategies.length).toBe(2);

      const durationDim = dimensions.find((d) => d.dimension === 'duration');
      expect(durationDim).toBeDefined();
    });

    it('stores all scores to database', async () => {
      const db = createMockDb({
        publishedVideos: [
          {
            youtubeVideoId: 'yt-1',
            category: 'educational',
            targetDuration: 180,
            targetAgeMin: 4,
            targetAgeMax: 6,
            publishedAt: new Date('2026-02-18T14:00:00Z'),
          },
        ],
        snapshots: [
          { youtubeVideoId: 'yt-1', viewCount: 15000, likeCount: 750, snapshotAt: new Date() },
        ],
      });

      const scorer = new StrategyScorer(db, mockLogger);
      await scorer.scoreAllDimensions({ avgViews: 10000, avgEngagement: 0.005 });

      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('store', () => {
    it('inserts evaluation into strategy_scores table', async () => {
      const db = createMockDb();
      const scorer = new StrategyScorer(db, mockLogger);

      await scorer.store({
        strategy: 'category:educational',
        category: 'educational',
        score: 1.5,
        sampleSize: 10,
      });

      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('getTopStrategies', () => {
    it('returns top strategies sorted by score', async () => {
      const db = createMockDb({
        strategies: [
          { strategy: 'category:song', category: 'song', score: 2.0, sampleSize: 5 },
          { strategy: 'category:educational', category: 'educational', score: 1.5, sampleSize: 10 },
        ],
      });

      const scorer = new StrategyScorer(db, mockLogger);
      const top = await scorer.getTopStrategies(5);

      expect(top).toHaveLength(2);
      expect(top[0].strategy).toBe('category:song');
      expect(top[0].score).toBe(2.0);
    });
  });
});
