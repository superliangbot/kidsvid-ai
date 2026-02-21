import type { YouTubeClient, PerformanceMetrics, Logger } from '@kidsvid/shared';
import type { Database } from '@kidsvid/shared';
import { performanceSnapshots, generatedVideos, eq } from '@kidsvid/shared/db';

/** Track published video performance over time. */

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
        ctr: 0, // Requires YouTube Analytics API (separate integration)
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
}
