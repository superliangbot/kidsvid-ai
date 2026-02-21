import type { Logger, StrategyEvaluation } from '@kidsvid/shared';
import type { Database } from '@kidsvid/shared';
import { performanceSnapshots, generatedVideos, strategyScores, desc } from '@kidsvid/shared/db';
import * as fs from 'fs';
import * as path from 'path';

/** Weekly performance report generator.
 * Summarizes video performance, evaluates strategies, and generates
 * actionable recommendations that feed back into the generator config. */

export interface WeeklyReport {
  period: { start: Date; end: Date };
  totalVideosPublished: number;
  totalViews: number;
  totalLikes: number;
  avgViewsPerVideo: number;
  avgEngagementRate: number;
  topPerformingVideoId: string | null;
  topStrategy: string | null;
  categoryBreakdown: Array<{
    category: string;
    count: number;
    avgViews: number;
    avgEngagement: number;
  }>;
  recommendations: string[];
  generatorUpdates: GeneratorConfigUpdate[];
}

export interface GeneratorConfigUpdate {
  field: string;
  currentValue: unknown;
  suggestedValue: unknown;
  reason: string;
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
      limit: 200,
    });

    // Get top strategies
    const strategies = await this.db.query.strategyScores.findMany({
      orderBy: [desc(strategyScores.score)],
      limit: 10,
    });

    // Get published videos for category breakdown
    const published = await this.db.query.generatedVideos.findMany({
      where: (gv, { eq: eqOp }) => eqOp(gv.status, 'published'),
    });

    const totalViews = snapshots.reduce((s, p) => s + (p.viewCount ?? 0), 0);
    const totalLikes = snapshots.reduce((s, p) => s + (p.likeCount ?? 0), 0);
    const uniqueVideos = new Set(snapshots.map((s) => s.youtubeVideoId));

    // Build category breakdown
    const categoryMap = new Map<
      string,
      { count: number; totalViews: number; totalLikes: number }
    >();
    for (const video of published) {
      const cat = video.category ?? 'other';
      const existing = categoryMap.get(cat) ?? {
        count: 0,
        totalViews: 0,
        totalLikes: 0,
      };
      existing.count++;

      const snap = snapshots.find(
        (s) => s.youtubeVideoId === video.youtubeVideoId,
      );
      if (snap) {
        existing.totalViews += snap.viewCount ?? 0;
        existing.totalLikes += snap.likeCount ?? 0;
      }
      categoryMap.set(cat, existing);
    }

    const categoryBreakdown = Array.from(categoryMap.entries()).map(
      ([category, data]) => ({
        category,
        count: data.count,
        avgViews: data.count > 0 ? Math.round(data.totalViews / data.count) : 0,
        avgEngagement:
          data.totalViews > 0 ? data.totalLikes / data.totalViews : 0,
      }),
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      categoryBreakdown,
      strategies,
      uniqueVideos.size,
      totalViews,
    );

    // Generate generator config updates
    const generatorUpdates = this.generateConfigUpdates(
      categoryBreakdown,
      strategies,
    );

    const topVideo = snapshots.sort(
      (a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0),
    )[0];

    const report: WeeklyReport = {
      period: { start, end },
      totalVideosPublished: uniqueVideos.size,
      totalViews,
      totalLikes,
      avgViewsPerVideo:
        uniqueVideos.size > 0 ? Math.round(totalViews / uniqueVideos.size) : 0,
      avgEngagementRate: totalViews > 0 ? totalLikes / totalViews : 0,
      topPerformingVideoId: topVideo?.youtubeVideoId ?? null,
      topStrategy: strategies[0]?.strategy ?? null,
      categoryBreakdown,
      recommendations,
      generatorUpdates,
    };

    this.logger.info(
      {
        videos: report.totalVideosPublished,
        views: report.totalViews,
        avgViews: report.avgViewsPerVideo,
        recommendations: recommendations.length,
        configUpdates: generatorUpdates.length,
      },
      'Weekly report generated',
    );

    return report;
  }

  /** Write learnings back to a generator config file */
  async feedBackToGenerator(
    updates: GeneratorConfigUpdate[],
    configPath?: string,
  ): Promise<void> {
    const outputPath =
      configPath ?? path.resolve(process.cwd(), 'generator-weights.json');

    let existing: Record<string, unknown> = {};
    try {
      if (fs.existsSync(outputPath)) {
        existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      }
    } catch {
      // Start fresh
    }

    for (const update of updates) {
      existing[update.field] = update.suggestedValue;
    }

    existing['lastUpdated'] = new Date().toISOString();
    existing['updateCount'] = (typeof existing['updateCount'] === 'number'
      ? existing['updateCount']
      : 0) + updates.length;

    fs.writeFileSync(outputPath, JSON.stringify(existing, null, 2));

    this.logger.info(
      { path: outputPath, updates: updates.length },
      'Generator weights updated from feedback',
    );
  }

  /** Format report as a readable string */
  formatReport(report: WeeklyReport): string {
    const lines: string[] = [
      '═══════════════════════════════════════',
      '       WEEKLY PERFORMANCE REPORT',
      '═══════════════════════════════════════',
      '',
      `Period: ${report.period.start.toISOString().slice(0, 10)} → ${report.period.end.toISOString().slice(0, 10)}`,
      '',
      `Videos Published: ${report.totalVideosPublished}`,
      `Total Views: ${report.totalViews.toLocaleString()}`,
      `Total Likes: ${report.totalLikes.toLocaleString()}`,
      `Avg Views/Video: ${report.avgViewsPerVideo.toLocaleString()}`,
      `Avg Engagement Rate: ${(report.avgEngagementRate * 100).toFixed(2)}%`,
      '',
    ];

    if (report.categoryBreakdown.length > 0) {
      lines.push('─── Category Breakdown ───');
      for (const cat of report.categoryBreakdown) {
        lines.push(
          `  ${cat.category}: ${cat.count} videos, avg ${cat.avgViews.toLocaleString()} views`,
        );
      }
      lines.push('');
    }

    if (report.recommendations.length > 0) {
      lines.push('─── Recommendations ───');
      for (const rec of report.recommendations) {
        lines.push(`  • ${rec}`);
      }
      lines.push('');
    }

    if (report.generatorUpdates.length > 0) {
      lines.push('─── Generator Config Updates ───');
      for (const update of report.generatorUpdates) {
        lines.push(`  ${update.field}: ${update.reason}`);
      }
      lines.push('');
    }

    lines.push('═══════════════════════════════════════');
    return lines.join('\n');
  }

  private generateRecommendations(
    categoryBreakdown: Array<{
      category: string;
      avgViews: number;
      count: number;
    }>,
    strategies: Array<{ strategy: string; score: number }>,
    totalVideos: number,
    totalViews: number,
  ): string[] {
    const recommendations: string[] = [];

    if (totalVideos === 0) {
      recommendations.push(
        'No published videos yet. Start generating content!',
      );
      return recommendations;
    }

    const avgViews = totalViews / totalVideos;

    if (avgViews < 1000) {
      recommendations.push(
        'Average views are low. Consider improving thumbnails and titles.',
      );
    }

    if (avgViews < 10000) {
      recommendations.push(
        'Focus on SEO: add more tags, optimize descriptions, use trending keywords.',
      );
    }

    // Find best/worst categories
    const sorted = [...categoryBreakdown].sort(
      (a, b) => b.avgViews - a.avgViews,
    );
    if (sorted.length >= 2) {
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];

      if (best.avgViews > worst.avgViews * 2) {
        recommendations.push(
          `Category "${best.category}" outperforms "${worst.category}" by ${Math.round(best.avgViews / Math.max(worst.avgViews, 1))}x. Consider shifting content mix.`,
        );
      }
    }

    // Strategy recommendations
    if (strategies.length > 0 && strategies[0].score > 1.5) {
      recommendations.push(
        `Strategy "${strategies[0].strategy}" is performing 50%+ above benchmark. Double down on this.`,
      );
    }

    if (strategies.length > 1) {
      const underperforming = strategies.filter((s) => s.score < 0.5);
      if (underperforming.length > 0) {
        recommendations.push(
          `Underperforming strategies: ${underperforming.map((s) => s.strategy).join(', ')}. Consider dropping or reworking.`,
        );
      }
    }

    // Upload frequency
    if (totalVideos < 3) {
      recommendations.push(
        'Upload frequency is below target (3-5/week). Increase production cadence.',
      );
    }

    return recommendations;
  }

  private generateConfigUpdates(
    categoryBreakdown: Array<{
      category: string;
      avgViews: number;
      count: number;
    }>,
    strategies: Array<{ strategy: string; score: number }>,
  ): GeneratorConfigUpdate[] {
    const updates: GeneratorConfigUpdate[] = [];

    // Suggest category weight adjustments
    if (categoryBreakdown.length >= 2) {
      const sorted = [...categoryBreakdown].sort(
        (a, b) => b.avgViews - a.avgViews,
      );

      const weights: Record<string, number> = {};
      const totalViews = sorted.reduce((s, c) => s + c.avgViews * c.count, 0);

      for (const cat of sorted) {
        weights[cat.category] =
          totalViews > 0
            ? Math.round(((cat.avgViews * cat.count) / totalViews) * 100)
            : Math.round(100 / sorted.length);
      }

      updates.push({
        field: 'categoryWeights',
        currentValue: 'equal',
        suggestedValue: weights,
        reason: `Adjust content mix based on performance: top category "${sorted[0].category}" gets ${weights[sorted[0].category]}% weight`,
      });
    }

    // Suggest optimal duration from strategies
    const durationStrategy = strategies.find((s) =>
      s.strategy.startsWith('duration:'),
    );
    if (durationStrategy) {
      const range = durationStrategy.strategy.replace('duration:', '');
      updates.push({
        field: 'preferredDuration',
        currentValue: '2-5min',
        suggestedValue: range,
        reason: `Duration "${range}" scores ${durationStrategy.score}x vs benchmark`,
      });
    }

    // Suggest optimal posting time from strategies
    const dayStrategy = strategies.find((s) =>
      s.strategy.startsWith('day_of_week:'),
    );
    if (dayStrategy) {
      const day = dayStrategy.strategy.replace('day_of_week:', '');
      updates.push({
        field: 'preferredPostDay',
        currentValue: 'any weekday',
        suggestedValue: day,
        reason: `${day} posts score ${dayStrategy.score}x vs benchmark`,
      });
    }

    return updates;
  }
}
