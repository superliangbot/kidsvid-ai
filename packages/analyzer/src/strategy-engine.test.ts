import { describe, it, expect, vi } from 'vitest';
import { StrategyEngine } from './strategy-engine.js';
import type { ChannelAnalysis, Logger } from '@kidsvid/shared';

const mockLogger: Logger = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
} as unknown as Logger;

const mockCompetitors: ChannelAnalysis[] = [
  {
    channelId: 'ch-1', name: 'Competitor A', primaryCategory: 'educational',
    uploadFrequency: 5, avgViews: 500000, avgLikes: 2500, engagementRate: 0.005,
    topVideoIds: ['v1'],
  },
  {
    channelId: 'ch-2', name: 'Competitor B', primaryCategory: 'song',
    uploadFrequency: 3, avgViews: 1000000, avgLikes: 5000, engagementRate: 0.005,
    topVideoIds: ['v2'],
  },
  {
    channelId: 'ch-3', name: 'Competitor C', primaryCategory: 'educational',
    uploadFrequency: 7, avgViews: 200000, avgLikes: 1000, engagementRate: 0.005,
    topVideoIds: ['v3'],
  },
  {
    channelId: 'ch-4', name: 'Competitor D', primaryCategory: 'story',
    uploadFrequency: 4, avgViews: 800000, avgLikes: 4000, engagementRate: 0.005,
    topVideoIds: ['v4'],
  },
];

describe('StrategyEngine', () => {
  describe('competitiveAnalysis', () => {
    it('returns competitive positions for all metrics', () => {
      const engine = new StrategyEngine(mockLogger);
      const positions = engine.competitiveAnalysis(
        {
          subscriberCount: 10000,
          totalViews: 5000000,
          videoCount: 50,
          avgViewsPerVideo: 100000,
          avgEngagementRate: 0.004,
          uploadFrequency: 3,
          topCategory: 'educational',
        },
        mockCompetitors,
      );

      expect(positions).toHaveLength(3);
      expect(positions.map(p => p.metric)).toEqual([
        'Average Views per Video',
        'Engagement Rate',
        'Upload Frequency (per week)',
      ]);
    });

    it('identifies "behind" status when below benchmark', () => {
      const engine = new StrategyEngine(mockLogger);
      const positions = engine.competitiveAnalysis(
        {
          subscriberCount: 100,
          totalViews: 1000,
          videoCount: 5,
          avgViewsPerVideo: 200,
          avgEngagementRate: 0.001,
          uploadFrequency: 1,
          topCategory: 'educational',
        },
        mockCompetitors,
      );

      expect(positions[0].status).toBe('behind');
      expect(positions[0].recommendation).toContain('thumbnail');
    });

    it('identifies "ahead" status when above benchmark', () => {
      const engine = new StrategyEngine(mockLogger);
      const positions = engine.competitiveAnalysis(
        {
          subscriberCount: 1000000,
          totalViews: 500000000,
          videoCount: 500,
          avgViewsPerVideo: 5000000,
          avgEngagementRate: 0.01,
          uploadFrequency: 7,
          topCategory: 'educational',
        },
        mockCompetitors,
      );

      expect(positions[0].status).toBe('ahead');
    });

    it('returns empty for no competitors', () => {
      const engine = new StrategyEngine(mockLogger);
      const positions = engine.competitiveAnalysis(
        { subscriberCount: 0, totalViews: 0, videoCount: 0, avgViewsPerVideo: 0, avgEngagementRate: 0, uploadFrequency: 0, topCategory: 'educational' },
        [],
      );
      expect(positions).toEqual([]);
    });
  });

  describe('findContentGaps', () => {
    it('identifies underserved categories', () => {
      const engine = new StrategyEngine(mockLogger);
      const gaps = engine.findContentGaps(mockCompetitors, []);

      expect(gaps.length).toBeGreaterThan(0);
      // Categories not covered by any competitor should appear
      const gapCategories = gaps.map(g => g.category);
      expect(gapCategories).toContain('nursery_rhyme'); // No competitors in this
    });

    it('sorts gaps by opportunity descending', () => {
      const engine = new StrategyEngine(mockLogger);
      const gaps = engine.findContentGaps(mockCompetitors, []);

      for (let i = 1; i < gaps.length; i++) {
        expect(gaps[i].opportunity).toBeLessThanOrEqual(gaps[i - 1].opportunity);
      }
    });

    it('provides recommendations for each gap', () => {
      const engine = new StrategyEngine(mockLogger);
      const gaps = engine.findContentGaps(mockCompetitors, []);

      for (const gap of gaps) {
        expect(gap.recommendation.length).toBeGreaterThan(10);
      }
    });
  });

  describe('optimizeUploadSchedule', () => {
    it('returns upload recommendations sorted by boost', () => {
      const engine = new StrategyEngine(mockLogger);
      const recs = engine.optimizeUploadSchedule([]);

      expect(recs.length).toBeGreaterThan(0);
      expect(recs.length).toBeLessThanOrEqual(10);

      // Should be sorted by boost descending
      for (let i = 1; i < recs.length; i++) {
        expect(recs[i].expectedEngagementBoost).toBeLessThanOrEqual(
          recs[i - 1].expectedEngagementBoost,
        );
      }
    });

    it('includes day and hour recommendations', () => {
      const engine = new StrategyEngine(mockLogger);
      const recs = engine.optimizeUploadSchedule([]);

      for (const rec of recs) {
        expect(rec.day).toBeDefined();
        expect(rec.hourUtc).toBeGreaterThanOrEqual(0);
        expect(rec.hourUtc).toBeLessThanOrEqual(23);
        expect(rec.expectedEngagementBoost).toBeGreaterThan(1);
      }
    });
  });

  describe('generateTitleRecommendations', () => {
    it('generates title templates with examples', () => {
      const engine = new StrategyEngine(mockLogger);
      const recs = engine.generateTitleRecommendations('counting', 'educational', []);

      expect(recs.length).toBeGreaterThan(3);

      for (const rec of recs) {
        expect(rec.template).toBeDefined();
        expect(rec.example).toBeDefined();
        expect(rec.reason).toBeDefined();
        expect(rec.expectedCtrBoost).toBeGreaterThanOrEqual(1);
      }
    });

    it('includes topic in examples', () => {
      const engine = new StrategyEngine(mockLogger);
      const recs = engine.generateTitleRecommendations('shapes', 'educational', []);

      const hasShapes = recs.some(r => r.example.toLowerCase().includes('shapes'));
      expect(hasShapes).toBe(true);
    });

    it('adds keyword recommendations from patterns', () => {
      const engine = new StrategyEngine(mockLogger);
      const recs = engine.generateTitleRecommendations('counting', 'educational', [
        {
          patternType: 'title_keywords',
          category: null,
          finding: 'top keywords',
          confidence: 0.8,
          sampleSize: 100,
          metadata: {
            topWords: [
              { word: 'kids' },
              { word: 'fun' },
              { word: 'learn' },
            ],
          },
        },
      ]);

      const keywordRec = recs.find(r => r.template.includes('keywords'));
      expect(keywordRec).toBeDefined();
      expect(keywordRec!.template).toContain('kids');
    });
  });

  describe('projectGrowth', () => {
    it('projects growth over 52 weeks', () => {
      const engine = new StrategyEngine(mockLogger);
      const projections = engine.projectGrowth({
        currentSubscribers: 100,
        currentWeeklyViews: 5000,
        currentTotalViews: 50000,
        uploadsPerWeek: 5,
        avgViewsPerVideo: 1000,
        weeksToProject: 52,
      });

      expect(projections.length).toBeGreaterThan(0);

      // Growth should be monotonically increasing
      for (let i = 1; i < projections.length; i++) {
        expect(projections[i].projectedSubscribers).toBeGreaterThan(
          projections[i - 1].projectedSubscribers,
        );
        expect(projections[i].projectedTotalViews).toBeGreaterThan(
          projections[i - 1].projectedTotalViews,
        );
      }
    });

    it('confidence decreases over time', () => {
      const engine = new StrategyEngine(mockLogger);
      const projections = engine.projectGrowth({
        currentSubscribers: 100,
        currentWeeklyViews: 5000,
        currentTotalViews: 50000,
        uploadsPerWeek: 3,
        avgViewsPerVideo: 500,
        weeksToProject: 52,
      });

      const first = projections[0];
      const last = projections[projections.length - 1];
      expect(last.confidence).toBeLessThan(first.confidence);
    });

    it('higher upload frequency = faster growth', () => {
      const engine = new StrategyEngine(mockLogger);
      const base = { currentSubscribers: 100, currentWeeklyViews: 0, currentTotalViews: 0, avgViewsPerVideo: 1000, weeksToProject: 12 };

      const slowGrowth = engine.projectGrowth({ ...base, uploadsPerWeek: 1 });
      const fastGrowth = engine.projectGrowth({ ...base, uploadsPerWeek: 5 });

      const slowFinal = slowGrowth[slowGrowth.length - 1];
      const fastFinal = fastGrowth[fastGrowth.length - 1];

      expect(fastFinal.projectedTotalViews).toBeGreaterThan(slowFinal.projectedTotalViews);
    });
  });
});
