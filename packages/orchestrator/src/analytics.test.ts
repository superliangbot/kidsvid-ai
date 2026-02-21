import { describe, it, expect, vi } from 'vitest';
import { AnalyticsEngine } from './analytics.js';
import type { Logger } from '@kidsvid/shared';
import type { Database } from '@kidsvid/shared';

const mockLogger: Logger = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
} as unknown as Logger;

function createMockDb(opts: {
  videos?: Array<Record<string, unknown>>;
  series?: Array<Record<string, unknown>>;
  runs?: Array<Record<string, unknown>>;
  snapshots?: Array<Record<string, unknown>>;
} = {}) {
  return {
    query: {
      generatedVideos: {
        findMany: vi.fn().mockResolvedValue(opts.videos ?? []),
      },
      contentSeries: {
        findMany: vi.fn().mockResolvedValue(opts.series ?? []),
      },
      analysisRuns: {
        findMany: vi.fn().mockResolvedValue(opts.runs ?? []),
      },
      performanceSnapshots: {
        findMany: vi.fn().mockResolvedValue(opts.snapshots ?? []),
      },
    },
  } as unknown as Database;
}

describe('AnalyticsEngine', () => {
  describe('getSummaryStats', () => {
    it('returns zeros for empty DB', async () => {
      const analytics = new AnalyticsEngine(createMockDb(), mockLogger);
      const stats = await analytics.getSummaryStats();
      expect(stats.totalScripts).toBe(0);
      expect(stats.passRate).toBe(0);
      expect(stats.totalSeries).toBe(0);
    });

    it('computes correct stats from videos', async () => {
      const db = createMockDb({
        videos: [
          { id: 1, category: 'educational', status: 'script_ready', generationMetadata: { qualityScore: { educationalValue: 9, engagementPotential: 8, passed: true } } },
          { id: 2, category: 'educational', status: 'draft', generationMetadata: { qualityScore: { educationalValue: 5, engagementPotential: 4, passed: false } } },
          { id: 3, category: 'song', status: 'script_ready', generationMetadata: { qualityScore: { educationalValue: 8, engagementPotential: 9, passed: true } } },
        ],
        series: [{ id: 1 }],
        runs: [{ id: 1 }, { id: 2 }],
      });
      const analytics = new AnalyticsEngine(db, mockLogger);
      const stats = await analytics.getSummaryStats();

      expect(stats.totalScripts).toBe(3);
      expect(stats.passRate).toBe(67); // 2/3
      expect(stats.avgEducationalScore).toBeCloseTo(7.3, 1);
      expect(stats.scriptsPerCategory).toEqual({ educational: 2, song: 1 });
      expect(stats.statusBreakdown).toEqual({ script_ready: 2, draft: 1 });
      expect(stats.totalSeries).toBe(1);
      expect(stats.totalAnalysisRuns).toBe(2);
    });
  });

  describe('getVideosOverTime', () => {
    it('groups videos by date', async () => {
      const today = new Date();
      const yesterday = new Date(Date.now() - 86400_000);
      const db = createMockDb({
        videos: [
          { createdAt: today },
          { createdAt: today },
          { createdAt: yesterday },
        ],
      });
      const analytics = new AnalyticsEngine(db, mockLogger);
      const result = await analytics.getVideosOverTime(7);

      expect(result.length).toBe(2);
      const todayEntry = result.find(r => r.date === today.toISOString().slice(0, 10));
      expect(todayEntry?.count).toBe(2);
    });
  });

  describe('getQualityDistribution', () => {
    it('buckets scores correctly', async () => {
      const db = createMockDb({
        videos: [
          { generationMetadata: { qualityScore: { educationalValue: 9 } } },
          { generationMetadata: { qualityScore: { educationalValue: 7 } } },
          { generationMetadata: { qualityScore: { educationalValue: 3 } } },
        ],
      });
      const analytics = new AnalyticsEngine(db, mockLogger);
      const dist = await analytics.getQualityDistribution();

      const bucket9 = dist.find(d => d.bucket === '9-10');
      const bucket7 = dist.find(d => d.bucket === '7-8');
      const bucket0 = dist.find(d => d.bucket === '0-4');
      expect(bucket9?.count).toBe(1);
      expect(bucket7?.count).toBe(1);
      expect(bucket0?.count).toBe(1);
    });
  });

  describe('getSeriesProgress', () => {
    it('returns progress for series', async () => {
      const db = createMockDb({
        series: [{ seriesId: 's1', name: 'Test', totalEpisodes: 5 }],
        videos: [
          { id: 1, status: 'published', generationMetadata: { qualityScore: { educationalValue: 8 } } },
          { id: 2, status: 'script_ready', generationMetadata: { qualityScore: { educationalValue: 9 } } },
        ],
      });
      // Override findMany to return filtered results for series episodes
      (db.query.generatedVideos.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 1, status: 'published', generationMetadata: { qualityScore: { educationalValue: 8 } } },
        { id: 2, status: 'script_ready', generationMetadata: { qualityScore: { educationalValue: 9 } } },
      ]);

      const analytics = new AnalyticsEngine(db, mockLogger);
      const progress = await analytics.getSeriesProgress();

      expect(progress).toHaveLength(1);
      expect(progress[0].seriesId).toBe('s1');
      expect(progress[0].generatedEpisodes).toBe(2);
      expect(progress[0].publishedEpisodes).toBe(1);
      expect(progress[0].avgQualityScore).toBe(8.5);
    });
  });

  describe('exportAll', () => {
    it('returns combined analytics blob', async () => {
      const db = createMockDb();
      const analytics = new AnalyticsEngine(db, mockLogger);
      const exported = await analytics.exportAll();

      expect(exported.exportedAt).toBeDefined();
      expect(exported.summary).toBeDefined();
      expect(exported.videosOverTime).toBeDefined();
      expect(exported.qualityDistribution).toBeDefined();
      expect(exported.seriesProgress).toBeDefined();
    });
  });
});
