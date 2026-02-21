import type { YouTubeClient, PerformanceMetrics, Logger } from '@kidsvid/shared';
import type { Database } from '@kidsvid/shared';
import { performanceSnapshots, generatedVideos, channels, eq } from '@kidsvid/shared/db';

/** Track published video performance over time.
 * Fetches current metrics from YouTube, stores snapshots, and compares against benchmarks. */

export interface Benchmark {
  avgViews: number;
  avgLikes: number;
  avgEngagementRate: number;
  avgCommentsPerVideo: number;
}

export interface TrackedVideo extends PerformanceMetrics {
  title: string;
  publishedAt: Date | null;
  daysSincePublish: number;
  viewsPerDay: number;
  aboveBenchmark: boolean;
  benchmarkRatio: number;
}

export class PerformanceTracker {
  constructor(
    private youtube: YouTubeClient,
    private db: Database,
    private logger: Logger,
  ) {}

  /** Snapshot current metrics for all published videos */
  async snapshotAll(): Promise<PerformanceMetrics[]> {
    const published = await this.db.query.generatedVideos.findMany({
      where: eq(generatedVideos.status, 'published'),
    });

    if (published.length === 0) {
      this.logger.info('No published videos to track');
      return [];
    }

    const videoIds = published
      .map((v) => v.youtubeVideoId)
      .filter((id): id is string => !!id);

    if (videoIds.length === 0) return [];

    const ytVideos = await this.youtube.getVideosBatch(videoIds);
    const metrics: PerformanceMetrics[] = [];

    for (const ytVideo of ytVideos) {
      const metric: PerformanceMetrics = {
        videoId: ytVideo.videoId,
        views: ytVideo.viewCount,
        likes: ytVideo.likeCount,
        comments: ytVideo.commentCount,
        ctr: 0, // Requires YouTube Analytics API
        avgWatchTime: 0,
        avgRetention: 0,
      };

      // Store snapshot
      const genVideo = published.find((v) => v.youtubeVideoId === ytVideo.videoId);
      await this.db.insert(performanceSnapshots).values({
        generatedVideoId: genVideo?.id,
        youtubeVideoId: ytVideo.videoId,
        viewCount: ytVideo.viewCount,
        likeCount: ytVideo.likeCount,
        commentCount: ytVideo.commentCount,
      });

      metrics.push(metric);
    }

    this.logger.info({ tracked: metrics.length }, 'Performance snapshot complete');
    return metrics;
  }

  /** Get detailed tracking with benchmark comparison */
  async trackWithBenchmarks(benchmark: Benchmark): Promise<TrackedVideo[]> {
    const published = await this.db.query.generatedVideos.findMany({
      where: eq(generatedVideos.status, 'published'),
    });

    if (published.length === 0) return [];

    const videoIds = published
      .map((v) => v.youtubeVideoId)
      .filter((id): id is string => !!id);

    if (videoIds.length === 0) return [];

    const ytVideos = await this.youtube.getVideosBatch(videoIds);
    const tracked: TrackedVideo[] = [];

    for (const ytVideo of ytVideos) {
      const genVideo = published.find((v) => v.youtubeVideoId === ytVideo.videoId);
      const publishDate = genVideo?.publishedAt ?? null;
      const daysSincePublish = publishDate
        ? Math.max(1, (Date.now() - publishDate.getTime()) / 86400_000)
        : 1;

      const viewsPerDay = ytVideo.viewCount / daysSincePublish;
      const benchmarkRatio = benchmark.avgViews > 0
        ? ytVideo.viewCount / benchmark.avgViews
        : 0;

      const item: TrackedVideo = {
        videoId: ytVideo.videoId,
        title: genVideo?.title ?? ytVideo.title,
        views: ytVideo.viewCount,
        likes: ytVideo.likeCount,
        comments: ytVideo.commentCount,
        ctr: 0,
        avgWatchTime: 0,
        avgRetention: 0,
        publishedAt: publishDate,
        daysSincePublish: Math.round(daysSincePublish),
        viewsPerDay: Math.round(viewsPerDay),
        aboveBenchmark: benchmarkRatio >= 1.0,
        benchmarkRatio: Math.round(benchmarkRatio * 100) / 100,
      };

      // Store snapshot
      await this.db.insert(performanceSnapshots).values({
        generatedVideoId: genVideo?.id,
        youtubeVideoId: ytVideo.videoId,
        viewCount: ytVideo.viewCount,
        likeCount: ytVideo.likeCount,
        commentCount: ytVideo.commentCount,
      });

      tracked.push(item);
    }

    const aboveCount = tracked.filter((t) => t.aboveBenchmark).length;
    this.logger.info(
      {
        tracked: tracked.length,
        aboveBenchmark: aboveCount,
        belowBenchmark: tracked.length - aboveCount,
      },
      'Performance tracking with benchmarks complete',
    );

    return tracked;
  }

  /** Compute benchmark from analysis of competitor channels */
  async computeBenchmark(): Promise<Benchmark> {
    const channelData = await this.db.query.channels.findMany({
      limit: 30,
    });

    if (channelData.length === 0) {
      return {
        avgViews: 1_000_000,
        avgLikes: 5_000,
        avgEngagementRate: 0.004,
        avgCommentsPerVideo: 100,
      };
    }

    const totalViews = channelData.reduce((s, c) => s + (c.avgViews ?? 0), 0);
    const totalLikes = channelData.reduce((s, c) => s + (c.avgLikes ?? 0), 0);
    const totalEngagement = channelData.reduce(
      (s, c) => s + (c.engagementRate ?? 0),
      0,
    );

    return {
      avgViews: Math.round(totalViews / channelData.length),
      avgLikes: Math.round(totalLikes / channelData.length),
      avgEngagementRate: totalEngagement / channelData.length,
      avgCommentsPerVideo: 100, // Default — analytics API needed for accuracy
    };
  }
}
