import type { Logger } from '@kidsvid/shared';
import type { Database } from '@kidsvid/shared';
import { performanceSnapshots, generatedVideos, strategyScores, desc } from '@kidsvid/shared/db';

/** Weekly performance report generator. */

export interface WeeklyReport {
  period: { start: Date; end: Date };
  totalVideosPublished: number;
  totalViews: number;
  totalLikes: number;
  avgViewsPerVideo: number;
  avgEngagementRate: number;
  topPerformingVideoId: string | null;
  topStrategy: string | null;
  recommendations: string[];
}

export class ReportGenerator {
  constructor(
    private db: Database,
    private logger: Logger,
  ) {}

  async generateWeeklyReport(): Promise<WeeklyReport> {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 86400_000);

    // Get recent snapshots
    const snapshots = await this.db.query.performanceSnapshots.findMany({
      orderBy: [desc(performanceSnapshots.snapshotAt)],
      limit: 100,
    });

    // Get top strategies
    const strategies = await this.db.query.strategyScores.findMany({
      orderBy: [desc(strategyScores.score)],
      limit: 5,
    });

    const totalViews = snapshots.reduce((s, p) => s + (p.viewCount ?? 0), 0);
    const totalLikes = snapshots.reduce((s, p) => s + (p.likeCount ?? 0), 0);
    const uniqueVideos = new Set(snapshots.map((s) => s.youtubeVideoId));

    const recommendations: string[] = [];

    if (uniqueVideos.size === 0) {
      recommendations.push('No published videos yet. Start generating content!');
    } else if (totalViews / uniqueVideos.size < 1000) {
      recommendations.push('Average views are low. Consider improving thumbnails and titles.');
    }

    if (strategies.length > 0 && strategies[0].score > 1.5) {
      recommendations.push(
        `Strategy "${strategies[0].strategy}" is performing 50%+ above benchmark. Double down on this.`,
      );
    }

    const topVideo = snapshots.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))[0];

    const report: WeeklyReport = {
      period: { start, end },
      totalVideosPublished: uniqueVideos.size,
      totalViews,
      totalLikes,
      avgViewsPerVideo: uniqueVideos.size > 0 ? totalViews / uniqueVideos.size : 0,
      avgEngagementRate:
        totalViews > 0 ? totalLikes / totalViews : 0,
      topPerformingVideoId: topVideo?.youtubeVideoId ?? null,
      topStrategy: strategies[0]?.strategy ?? null,
      recommendations,
    };

    this.logger.info(
      {
        videos: report.totalVideosPublished,
        views: report.totalViews,
        avgViews: Math.round(report.avgViewsPerVideo),
      },
      'Weekly report generated',
    );

    return report;
  }
}
