import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PerformanceTracker } from './tracker.js';
import type { YouTubeClient, Logger } from '@kidsvid/shared';
import type { Database } from '@kidsvid/shared';

const mockLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

function createMockYouTube(videos: Array<{ videoId: string; viewCount: number; likeCount: number; commentCount: number }>) {
  return {
    getVideosBatch: vi.fn().mockResolvedValue(
      videos.map((v) => ({
        videoId: v.videoId,
        title: `Video ${v.videoId}`,
        viewCount: v.viewCount,
        likeCount: v.likeCount,
        commentCount: v.commentCount,
      })),
    ),
  } as unknown as YouTubeClient;
}

function createMockDb(publishedVideos: Array<{ id: number; youtubeVideoId: string | null; status: string; publishedAt: Date | null; title: string }>) {
  return {
    query: {
      generatedVideos: {
        findMany: vi.fn().mockResolvedValue(publishedVideos),
      },
      channels: {
        findMany: vi.fn().mockResolvedValue([
          { avgViews: 500000, avgLikes: 2000, engagementRate: 0.004 },
          { avgViews: 1000000, avgLikes: 5000, engagementRate: 0.005 },
        ]),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  } as unknown as Database;
}

describe('PerformanceTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('snapshotAll', () => {
    it('returns empty array when no published videos', async () => {
      const db = createMockDb([]);
      const yt = createMockYouTube([]);
      const tracker = new PerformanceTracker(yt, db, mockLogger);

      const result = await tracker.snapshotAll();
      expect(result).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith('No published videos to track');
    });

    it('fetches metrics from YouTube and stores snapshots', async () => {
      const db = createMockDb([
        { id: 1, youtubeVideoId: 'yt-1', status: 'published', publishedAt: new Date('2026-01-01'), title: 'Video 1' },
        { id: 2, youtubeVideoId: 'yt-2', status: 'published', publishedAt: new Date('2026-01-15'), title: 'Video 2' },
      ]);
      const yt = createMockYouTube([
        { videoId: 'yt-1', viewCount: 10000, likeCount: 500, commentCount: 20 },
        { videoId: 'yt-2', viewCount: 5000, likeCount: 200, commentCount: 10 },
      ]);

      const tracker = new PerformanceTracker(yt, db, mockLogger);
      const result = await tracker.snapshotAll();

      expect(result).toHaveLength(2);
      expect(result[0].views).toBe(10000);
      expect(result[1].views).toBe(5000);
      expect(db.insert).toHaveBeenCalledTimes(2);
    });

    it('filters out videos without youtubeVideoId', async () => {
      const db = createMockDb([
        { id: 1, youtubeVideoId: null, status: 'published', publishedAt: null, title: 'No ID' },
      ]);
      const yt = createMockYouTube([]);
      const tracker = new PerformanceTracker(yt, db, mockLogger);

      const result = await tracker.snapshotAll();
      expect(result).toEqual([]);
    });
  });

  describe('trackWithBenchmarks', () => {
    it('compares videos against benchmarks', async () => {
      const db = createMockDb([
        { id: 1, youtubeVideoId: 'yt-1', status: 'published', publishedAt: new Date('2026-01-01'), title: 'Above Benchmark' },
        { id: 2, youtubeVideoId: 'yt-2', status: 'published', publishedAt: new Date('2026-02-01'), title: 'Below Benchmark' },
      ]);
      const yt = createMockYouTube([
        { videoId: 'yt-1', viewCount: 20000, likeCount: 1000, commentCount: 50 },
        { videoId: 'yt-2', viewCount: 2000, likeCount: 50, commentCount: 2 },
      ]);

      const tracker = new PerformanceTracker(yt, db, mockLogger);
      const result = await tracker.trackWithBenchmarks({
        avgViews: 10000,
        avgLikes: 500,
        avgEngagementRate: 0.005,
        avgCommentsPerVideo: 20,
      });

      expect(result).toHaveLength(2);
      expect(result[0].aboveBenchmark).toBe(true);
      expect(result[0].benchmarkRatio).toBe(2);
      expect(result[1].aboveBenchmark).toBe(false);
      expect(result[1].benchmarkRatio).toBe(0.2);
    });

    it('calculates views per day', async () => {
      const publishDate = new Date(Date.now() - 10 * 86400_000); // 10 days ago
      const db = createMockDb([
        { id: 1, youtubeVideoId: 'yt-1', status: 'published', publishedAt: publishDate, title: 'Test' },
      ]);
      const yt = createMockYouTube([
        { videoId: 'yt-1', viewCount: 10000, likeCount: 500, commentCount: 20 },
      ]);

      const tracker = new PerformanceTracker(yt, db, mockLogger);
      const result = await tracker.trackWithBenchmarks({
        avgViews: 5000,
        avgLikes: 200,
        avgEngagementRate: 0.004,
        avgCommentsPerVideo: 10,
      });

      expect(result[0].viewsPerDay).toBeGreaterThan(900);
      expect(result[0].viewsPerDay).toBeLessThan(1100);
      expect(result[0].daysSincePublish).toBeGreaterThanOrEqual(10);
    });
  });

  describe('computeBenchmark', () => {
    it('computes average benchmark from channel data', async () => {
      const db = createMockDb([]);
      const yt = createMockYouTube([]);
      const tracker = new PerformanceTracker(yt, db, mockLogger);

      const benchmark = await tracker.computeBenchmark();

      expect(benchmark.avgViews).toBe(750000);
      expect(benchmark.avgLikes).toBe(3500);
      expect(benchmark.avgEngagementRate).toBeCloseTo(0.0045, 3);
    });

    it('returns defaults when no channels in DB', async () => {
      const db = {
        query: {
          generatedVideos: { findMany: vi.fn().mockResolvedValue([]) },
          channels: { findMany: vi.fn().mockResolvedValue([]) },
        },
        insert: vi.fn(),
      } as unknown as Database;
      const yt = createMockYouTube([]);
      const tracker = new PerformanceTracker(yt, db, mockLogger);

      const benchmark = await tracker.computeBenchmark();
      expect(benchmark.avgViews).toBe(1_000_000);
    });
  });
});
