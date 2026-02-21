import type { YouTubeVideoInfo, ChannelAnalysis, ContentCategory } from '@kidsvid/shared';
import type { CategorizeResult } from './categorizer.js';

/** Analyze engagement patterns across channels and videos */

export interface EngagementStats {
  totalVideos: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  avgViews: number;
  avgLikes: number;
  avgComments: number;
  avgEngagementRate: number;
  medianViews: number;
  top10PctAvgViews: number;
  bottom10PctAvgViews: number;
  viewsPerDay: number;
}

export function computeEngagementStats(videos: YouTubeVideoInfo[]): EngagementStats {
  if (videos.length === 0) {
    return {
      totalVideos: 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      avgViews: 0,
      avgLikes: 0,
      avgComments: 0,
      avgEngagementRate: 0,
      medianViews: 0,
      top10PctAvgViews: 0,
      bottom10PctAvgViews: 0,
      viewsPerDay: 0,
    };
  }

  const totalViews = videos.reduce((s, v) => s + v.viewCount, 0);
  const totalLikes = videos.reduce((s, v) => s + v.likeCount, 0);
  const totalComments = videos.reduce((s, v) => s + v.commentCount, 0);

  const sorted = [...videos].sort((a, b) => b.viewCount - a.viewCount);
  const top10Pct = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.1)));
  const bottom10Pct = sorted.slice(-Math.max(1, Math.ceil(sorted.length * 0.1)));

  const viewsSorted = videos.map((v) => v.viewCount).sort((a, b) => a - b);
  const mid = Math.floor(viewsSorted.length / 2);
  const medianViews =
    viewsSorted.length % 2 !== 0
      ? viewsSorted[mid]
      : (viewsSorted[mid - 1] + viewsSorted[mid]) / 2;

  // Views per day (for videos with publish dates)
  const withDates = videos.filter((v) => v.publishedAt);
  let viewsPerDay = 0;
  if (withDates.length > 0) {
    const now = Date.now();
    const rates = withDates.map((v) => {
      const age = (now - new Date(v.publishedAt).getTime()) / 86400_000; // days
      return age > 0 ? v.viewCount / age : 0;
    });
    viewsPerDay = rates.reduce((a, b) => a + b, 0) / rates.length;
  }

  const engagementRates = videos
    .filter((v) => v.viewCount > 0)
    .map((v) => (v.likeCount + v.commentCount) / v.viewCount);

  return {
    totalVideos: videos.length,
    totalViews,
    totalLikes,
    totalComments,
    avgViews: totalViews / videos.length,
    avgLikes: totalLikes / videos.length,
    avgComments: totalComments / videos.length,
    avgEngagementRate:
      engagementRates.length > 0
        ? engagementRates.reduce((a, b) => a + b, 0) / engagementRates.length
        : 0,
    medianViews,
    top10PctAvgViews:
      top10Pct.reduce((s, v) => s + v.viewCount, 0) / top10Pct.length,
    bottom10PctAvgViews:
      bottom10Pct.reduce((s, v) => s + v.viewCount, 0) / bottom10Pct.length,
    viewsPerDay,
  };
}

export function buildChannelAnalysis(
  channelId: string,
  channelName: string,
  videos: YouTubeVideoInfo[],
  channelCategory: CategorizeResult,
): ChannelAnalysis {
  const stats = computeEngagementStats(videos);

  // Calculate upload frequency (videos per week from recent uploads)
  let uploadFrequency = 0;
  const sorted = [...videos]
    .filter((v) => v.publishedAt)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  if (sorted.length >= 2) {
    const newest = new Date(sorted[0].publishedAt).getTime();
    const oldest = new Date(sorted[sorted.length - 1].publishedAt).getTime();
    const weeks = (newest - oldest) / (7 * 24 * 3600_000);
    if (weeks > 0) {
      uploadFrequency = sorted.length / weeks;
    }
  }

  // Top 5 videos by views
  const topVideoIds = [...videos]
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 5)
    .map((v) => v.videoId);

  return {
    channelId,
    name: channelName,
    primaryCategory: channelCategory.category,
    uploadFrequency: Math.round(uploadFrequency * 10) / 10,
    avgViews: Math.round(stats.avgViews),
    avgLikes: Math.round(stats.avgLikes),
    engagementRate: Math.round(stats.avgEngagementRate * 10000) / 10000,
    topVideoIds,
  };
}

/** Rank channels by a composite score */
export function rankChannels(analyses: ChannelAnalysis[]): (ChannelAnalysis & { rank: number; score: number })[] {
  // Composite score: weighted combination of views, engagement, frequency
  const maxViews = Math.max(...analyses.map((a) => a.avgViews), 1);
  const maxFreq = Math.max(...analyses.map((a) => a.uploadFrequency), 1);

  return analyses
    .map((a) => ({
      ...a,
      score:
        (a.avgViews / maxViews) * 0.5 + // 50% weight on views
        a.engagementRate * 100 * 0.3 + // 30% weight on engagement
        (a.uploadFrequency / maxFreq) * 0.2, // 20% weight on frequency
    }))
    .sort((a, b) => b.score - a.score)
    .map((a, i) => ({ ...a, rank: i + 1 }));
}

/** Identify viral outlier videos (>3x average views) */
export function findViralOutliers(
  videos: YouTubeVideoInfo[],
  categories: Map<string, CategorizeResult>,
): { video: YouTubeVideoInfo; category: ContentCategory; viralMultiplier: number }[] {
  if (videos.length === 0) return [];

  const avgViews = videos.reduce((s, v) => s + v.viewCount, 0) / videos.length;
  const threshold = avgViews * 3;

  return videos
    .filter((v) => v.viewCount > threshold)
    .map((v) => ({
      video: v,
      category: categories.get(v.videoId)?.category || 'other',
      viralMultiplier: Math.round((v.viewCount / avgViews) * 10) / 10,
    }))
    .sort((a, b) => b.viralMultiplier - a.viralMultiplier);
}
