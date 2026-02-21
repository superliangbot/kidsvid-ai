import { describe, it, expect } from 'vitest';
import {
  computeEngagementStats,
  buildChannelAnalysis,
  rankChannels,
  findViralOutliers,
} from './engagement.js';
import { categorizeVideo } from './categorizer.js';
import type { YouTubeVideoInfo } from '@kidsvid/shared';

function makeVideo(overrides: Partial<YouTubeVideoInfo> = {}): YouTubeVideoInfo {
  return {
    videoId: 'test-' + Math.random().toString(36).slice(2, 8),
    channelId: 'UC_test',
    title: 'Test Video',
    description: '',
    publishedAt: '2024-01-15T10:00:00Z',
    duration: 180,
    viewCount: 500000,
    likeCount: 10000,
    commentCount: 1000,
    tags: [],
    thumbnailUrl: '',
    defaultLanguage: 'en',
    categoryId: '24',
    ...overrides,
  };
}

describe('computeEngagementStats', () => {
  it('computes correct stats for a set of videos', () => {
    const videos = [
      makeVideo({ viewCount: 1000000, likeCount: 50000, commentCount: 5000 }),
      makeVideo({ viewCount: 500000, likeCount: 25000, commentCount: 2500 }),
      makeVideo({ viewCount: 250000, likeCount: 12500, commentCount: 1250 }),
    ];
    const stats = computeEngagementStats(videos);

    expect(stats.totalVideos).toBe(3);
    expect(stats.totalViews).toBe(1750000);
    expect(stats.totalLikes).toBe(87500);
    expect(stats.totalComments).toBe(8750);
    expect(stats.avgViews).toBeCloseTo(583333, -1);
    expect(stats.avgLikes).toBeCloseTo(29167, -1);
    expect(stats.avgComments).toBeCloseTo(2917, -1);
    expect(stats.avgEngagementRate).toBeCloseTo(0.055, 2);
    expect(stats.medianViews).toBe(500000);
  });

  it('handles empty array', () => {
    const stats = computeEngagementStats([]);
    expect(stats.totalVideos).toBe(0);
    expect(stats.avgViews).toBe(0);
    expect(stats.avgEngagementRate).toBe(0);
  });

  it('handles single video', () => {
    const stats = computeEngagementStats([
      makeVideo({ viewCount: 100, likeCount: 10, commentCount: 1 }),
    ]);
    expect(stats.totalVideos).toBe(1);
    expect(stats.medianViews).toBe(100);
    expect(stats.avgEngagementRate).toBeCloseTo(0.11, 2);
  });

  it('computes top/bottom 10% correctly', () => {
    const videos = Array.from({ length: 20 }, (_, i) =>
      makeVideo({ viewCount: (i + 1) * 100000 }),
    );
    const stats = computeEngagementStats(videos);

    // Top 10% = top 2 videos: 2M and 1.9M
    expect(stats.top10PctAvgViews).toBeCloseTo(1950000, -4);
    // Bottom 10% = bottom 2 videos: 100K and 200K
    expect(stats.bottom10PctAvgViews).toBeCloseTo(150000, -4);
  });

  it('computes views per day', () => {
    const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const stats = computeEngagementStats([
      makeVideo({ viewCount: 70000, publishedAt: oneWeekAgo }),
    ]);
    // ~10,000 views/day
    expect(stats.viewsPerDay).toBeGreaterThan(8000);
    expect(stats.viewsPerDay).toBeLessThan(12000);
  });
});

describe('buildChannelAnalysis', () => {
  it('builds analysis from channel videos', () => {
    const videos = Array.from({ length: 10 }, (_, i) => {
      const date = new Date('2024-01-01T12:00:00Z');
      date.setDate(date.getDate() + i * 2);
      return makeVideo({
        videoId: `v${i}`,
        title: 'Learn Colors with Fun Toys',
        viewCount: 100000 * (i + 1),
        likeCount: 5000 * (i + 1),
        commentCount: 500 * (i + 1),
        publishedAt: date.toISOString(),
      });
    });

    const channelCat = categorizeVideo(videos[0]); // Use first video as proxy
    const analysis = buildChannelAnalysis('UC_test', 'Test Channel', videos, channelCat);

    expect(analysis.channelId).toBe('UC_test');
    expect(analysis.name).toBe('Test Channel');
    expect(analysis.primaryCategory).toBe('educational');
    expect(analysis.avgViews).toBe(550000);
    expect(analysis.topVideoIds).toHaveLength(5);
    expect(analysis.topVideoIds[0]).toBe('v9'); // highest views
    expect(analysis.uploadFrequency).toBeGreaterThan(0);
    expect(analysis.engagementRate).toBeGreaterThan(0);
  });

  it('handles empty videos', () => {
    const channelCat = { category: 'other' as const, confidence: 0, scores: {} as Record<string, number> };
    const analysis = buildChannelAnalysis('UC_test', 'Empty', [], channelCat as any);

    expect(analysis.avgViews).toBe(0);
    expect(analysis.uploadFrequency).toBe(0);
    expect(analysis.topVideoIds).toHaveLength(0);
  });
});

describe('rankChannels', () => {
  it('ranks channels by composite score', () => {
    const analyses = [
      {
        channelId: 'ch1',
        name: 'Low Channel',
        primaryCategory: 'other' as const,
        uploadFrequency: 1,
        avgViews: 10000,
        avgLikes: 500,
        engagementRate: 0.01,
        topVideoIds: [],
      },
      {
        channelId: 'ch2',
        name: 'High Channel',
        primaryCategory: 'educational' as const,
        uploadFrequency: 7,
        avgViews: 5000000,
        avgLikes: 100000,
        engagementRate: 0.05,
        topVideoIds: [],
      },
      {
        channelId: 'ch3',
        name: 'Mid Channel',
        primaryCategory: 'song' as const,
        uploadFrequency: 3,
        avgViews: 1000000,
        avgLikes: 30000,
        engagementRate: 0.03,
        topVideoIds: [],
      },
    ];

    const ranked = rankChannels(analyses);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].name).toBe('High Channel');
    expect(ranked[0].rank).toBe(1);
    expect(ranked[2].name).toBe('Low Channel');
    expect(ranked[2].rank).toBe(3);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('handles single channel', () => {
    const ranked = rankChannels([
      {
        channelId: 'ch1',
        name: 'Only',
        primaryCategory: 'song' as const,
        uploadFrequency: 3,
        avgViews: 500000,
        avgLikes: 10000,
        engagementRate: 0.02,
        topVideoIds: [],
      },
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].rank).toBe(1);
  });

  it('handles empty array', () => {
    const ranked = rankChannels([]);
    expect(ranked).toHaveLength(0);
  });
});

describe('findViralOutliers', () => {
  it('finds videos with >3x average views', () => {
    const videos = [
      ...Array.from({ length: 9 }, (_, i) =>
        makeVideo({ videoId: `norm${i}`, viewCount: 100000 }),
      ),
      makeVideo({ videoId: 'viral1', viewCount: 5000000 }),
    ];

    const categories = new Map(
      videos.map((v) => [v.videoId, categorizeVideo(v)]),
    );

    const outliers = findViralOutliers(videos, categories);
    expect(outliers.length).toBe(1);
    expect(outliers[0].video.videoId).toBe('viral1');
    expect(outliers[0].viralMultiplier).toBeGreaterThan(3);
  });

  it('returns empty for uniform views', () => {
    const videos = Array.from({ length: 10 }, (_, i) =>
      makeVideo({ videoId: `v${i}`, viewCount: 100000 }),
    );
    const categories = new Map(
      videos.map((v) => [v.videoId, categorizeVideo(v)]),
    );
    const outliers = findViralOutliers(videos, categories);
    expect(outliers).toHaveLength(0);
  });

  it('sorts outliers by multiplier descending', () => {
    const videos = [
      ...Array.from({ length: 18 }, (_, i) =>
        makeVideo({ videoId: `norm${i}`, viewCount: 100000 }),
      ),
      makeVideo({ videoId: 'viral1', viewCount: 2000000 }),
      makeVideo({ videoId: 'viral2', viewCount: 5000000 }),
    ];
    // Average: ~445K, 3x = ~1.33M, so both viral videos qualify
    const categories = new Map(
      videos.map((v) => [v.videoId, categorizeVideo(v)]),
    );
    const outliers = findViralOutliers(videos, categories);
    expect(outliers.length).toBe(2);
    expect(outliers[0].video.videoId).toBe('viral2'); // Higher multiplier first
    expect(outliers[0].viralMultiplier).toBeGreaterThan(outliers[1].viralMultiplier);
  });

  it('handles empty input', () => {
    const outliers = findViralOutliers([], new Map());
    expect(outliers).toHaveLength(0);
  });
});
