import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportGenerator } from './reporter.js';
import type { Logger } from '@kidsvid/shared';
import type { Database } from '@kidsvid/shared';

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const mockLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

function createMockDb(options?: {
  snapshots?: Array<Record<string, unknown>>;
  strategies?: Array<Record<string, unknown>>;
  published?: Array<Record<string, unknown>>;
}) {
  return {
    query: {
      performanceSnapshots: {
        findMany: vi.fn().mockResolvedValue(options?.snapshots ?? []),
      },
      strategyScores: {
        findMany: vi.fn().mockResolvedValue(options?.strategies ?? []),
      },
      generatedVideos: {
        findMany: vi.fn().mockResolvedValue(options?.published ?? []),
      },
    },
  } as unknown as Database;
}

describe('ReportGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateWeeklyReport', () => {
    it('generates report with no data', async () => {
      const db = createMockDb();
      const reporter = new ReportGenerator(db, mockLogger);

      const report = await reporter.generateWeeklyReport();

      expect(report.totalVideosPublished).toBe(0);
      expect(report.totalViews).toBe(0);
      expect(report.recommendations).toContain(
        'No published videos yet. Start generating content!',
      );
    });

    it('generates report with performance data', async () => {
      const db = createMockDb({
        snapshots: [
          { youtubeVideoId: 'yt-1', viewCount: 15000, likeCount: 750, snapshotAt: new Date() },
          { youtubeVideoId: 'yt-2', viewCount: 8000, likeCount: 300, snapshotAt: new Date() },
        ],
        strategies: [
          { strategy: 'category:song', score: 1.8 },
          { strategy: 'category:educational', score: 1.2 },
        ],
        published: [
          { youtubeVideoId: 'yt-1', category: 'song', status: 'published' },
          { youtubeVideoId: 'yt-2', category: 'educational', status: 'published' },
        ],
      });

      const reporter = new ReportGenerator(db, mockLogger);
      const report = await reporter.generateWeeklyReport();

      expect(report.totalVideosPublished).toBe(2);
      expect(report.totalViews).toBe(23000);
      expect(report.totalLikes).toBe(1050);
      expect(report.avgViewsPerVideo).toBe(11500);
      expect(report.topPerformingVideoId).toBe('yt-1');
      expect(report.topStrategy).toBe('category:song');
    });

    it('generates category breakdown', async () => {
      const db = createMockDb({
        snapshots: [
          { youtubeVideoId: 'yt-1', viewCount: 20000, likeCount: 1000, snapshotAt: new Date() },
          { youtubeVideoId: 'yt-2', viewCount: 5000, likeCount: 200, snapshotAt: new Date() },
        ],
        published: [
          { youtubeVideoId: 'yt-1', category: 'song', status: 'published' },
          { youtubeVideoId: 'yt-2', category: 'song', status: 'published' },
        ],
      });

      const reporter = new ReportGenerator(db, mockLogger);
      const report = await reporter.generateWeeklyReport();

      expect(report.categoryBreakdown.length).toBeGreaterThan(0);
      const songCat = report.categoryBreakdown.find((c) => c.category === 'song');
      expect(songCat).toBeDefined();
      expect(songCat!.count).toBe(2);
    });

    it('recommends improving thumbnails when views are low', async () => {
      const db = createMockDb({
        snapshots: [
          { youtubeVideoId: 'yt-1', viewCount: 500, likeCount: 10, snapshotAt: new Date() },
        ],
        published: [
          { youtubeVideoId: 'yt-1', category: 'educational', status: 'published' },
        ],
      });

      const reporter = new ReportGenerator(db, mockLogger);
      const report = await reporter.generateWeeklyReport();

      const hasLowViewsRec = report.recommendations.some((r) =>
        r.includes('improving thumbnails'),
      );
      expect(hasLowViewsRec).toBe(true);
    });

    it('recommends doubling down on high-performing strategy', async () => {
      const db = createMockDb({
        snapshots: [
          { youtubeVideoId: 'yt-1', viewCount: 50000, likeCount: 2500, snapshotAt: new Date() },
        ],
        strategies: [{ strategy: 'category:nursery_rhyme', score: 2.0 }],
        published: [
          { youtubeVideoId: 'yt-1', category: 'nursery_rhyme', status: 'published' },
        ],
      });

      const reporter = new ReportGenerator(db, mockLogger);
      const report = await reporter.generateWeeklyReport();

      const hasStrategyRec = report.recommendations.some((r) =>
        r.includes('Double down'),
      );
      expect(hasStrategyRec).toBe(true);
    });

    it('generates config updates from performance data', async () => {
      const db = createMockDb({
        snapshots: [
          { youtubeVideoId: 'yt-1', viewCount: 20000, likeCount: 1000, snapshotAt: new Date() },
          { youtubeVideoId: 'yt-2', viewCount: 5000, likeCount: 200, snapshotAt: new Date() },
        ],
        strategies: [
          { strategy: 'duration:medium (2-5min)', score: 1.8 },
          { strategy: 'day_of_week:Wednesday', score: 1.5 },
        ],
        published: [
          { youtubeVideoId: 'yt-1', category: 'song', status: 'published' },
          { youtubeVideoId: 'yt-2', category: 'educational', status: 'published' },
        ],
      });

      const reporter = new ReportGenerator(db, mockLogger);
      const report = await reporter.generateWeeklyReport();

      expect(report.generatorUpdates.length).toBeGreaterThan(0);

      const durationUpdate = report.generatorUpdates.find(
        (u) => u.field === 'preferredDuration',
      );
      expect(durationUpdate?.suggestedValue).toBe('medium (2-5min)');

      const dayUpdate = report.generatorUpdates.find(
        (u) => u.field === 'preferredPostDay',
      );
      expect(dayUpdate?.suggestedValue).toBe('Wednesday');
    });
  });

  describe('feedBackToGenerator', () => {
    it('writes generator weights file', async () => {
      const db = createMockDb();
      const reporter = new ReportGenerator(db, mockLogger);
      const fs = await import('fs');

      await reporter.feedBackToGenerator(
        [
          {
            field: 'categoryWeights',
            currentValue: 'equal',
            suggestedValue: { song: 60, educational: 40 },
            reason: 'Song outperforms',
          },
        ],
        '/tmp/test-weights.json',
      );

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/tmp/test-weights.json',
        expect.stringContaining('categoryWeights'),
      );
    });
  });

  describe('formatReport', () => {
    it('formats report as readable string', async () => {
      const db = createMockDb({
        snapshots: [
          { youtubeVideoId: 'yt-1', viewCount: 10000, likeCount: 500, snapshotAt: new Date() },
        ],
        published: [
          { youtubeVideoId: 'yt-1', category: 'educational', status: 'published' },
        ],
      });

      const reporter = new ReportGenerator(db, mockLogger);
      const report = await reporter.generateWeeklyReport();
      const formatted = reporter.formatReport(report);

      expect(formatted).toContain('WEEKLY PERFORMANCE REPORT');
      expect(formatted).toContain('Videos Published:');
      expect(formatted).toContain('Total Views:');
    });
  });
});
