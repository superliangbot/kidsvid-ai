import type { StrategyEvaluation, ContentCategory, Logger } from '@kidsvid/shared';
import type { Database } from '@kidsvid/shared';
import { strategyScores, generatedVideos, performanceSnapshots, desc } from '@kidsvid/shared/db';

/** Score content strategies based on actual performance data.
 * Evaluates: format, topic, length, time posted, engagement hooks, characters. */

export interface StrategyInput {
  strategy: string;
  category: ContentCategory | null;
  videoIds: string[];
  avgViews: number;
  avgEngagement: number;
  benchmarkViews: number;
  benchmarkEngagement: number;
}

export interface StrategyDimension {
  dimension: string;
  strategies: StrategyEvaluation[];
}

export class StrategyScorer {
  constructor(
    private db: Database,
    private logger: Logger,
  ) {}

  /** Evaluate a strategy against benchmarks */
  evaluate(input: StrategyInput): StrategyEvaluation {
    const viewScore = input.benchmarkViews > 0
      ? input.avgViews / input.benchmarkViews
      : 0;
    const engagementScore = input.benchmarkEngagement > 0
      ? input.avgEngagement / input.benchmarkEngagement
      : 0;

    // Combined score (views weighted 60%, engagement 40%)
    const score = viewScore * 0.6 + engagementScore * 0.4;

    return {
      strategy: input.strategy,
      category: input.category,
      score: Math.round(score * 100) / 100,
      sampleSize: input.videoIds.length,
    };
  }

  /** Score content across multiple strategy dimensions */
  async scoreAllDimensions(benchmark: {
    avgViews: number;
    avgEngagement: number;
  }): Promise<StrategyDimension[]> {
    const videos = await this.db.query.generatedVideos.findMany({
      where: (gv, { eq: eqOp }) => eqOp(gv.status, 'published'),
    });

    if (videos.length === 0) {
      this.logger.info('No published videos to score');
      return [];
    }

    const snapshots = await this.db.query.performanceSnapshots.findMany({
      orderBy: [desc(performanceSnapshots.snapshotAt)],
    });

    // Build a view map: youtubeVideoId -> latest views
    const viewMap = new Map<string, { views: number; likes: number }>();
    for (const snap of snapshots) {
      if (!viewMap.has(snap.youtubeVideoId)) {
        viewMap.set(snap.youtubeVideoId, {
          views: snap.viewCount ?? 0,
          likes: snap.likeCount ?? 0,
        });
      }
    }

    const dimensions: StrategyDimension[] = [];

    // ─── Dimension 1: Content Category ───
    dimensions.push(
      this.scoreDimension('category', videos, viewMap, benchmark, (v) =>
        v.category ?? 'other',
      ),
    );

    // ─── Dimension 2: Target Duration ───
    dimensions.push(
      this.scoreDimension('duration', videos, viewMap, benchmark, (v) => {
        const dur = v.targetDuration ?? 180;
        if (dur < 120) return 'short (<2min)';
        if (dur < 300) return 'medium (2-5min)';
        if (dur < 600) return 'long (5-10min)';
        return 'very_long (>10min)';
      }),
    );

    // ─── Dimension 3: Age Range ───
    dimensions.push(
      this.scoreDimension('age_range', videos, viewMap, benchmark, (v) => {
        const min = v.targetAgeMin ?? 2;
        const max = v.targetAgeMax ?? 8;
        return `${min}-${max}`;
      }),
    );

    // ─── Dimension 4: Published Day of Week ───
    dimensions.push(
      this.scoreDimension('day_of_week', videos, viewMap, benchmark, (v) => {
        const day = v.publishedAt?.getUTCDay();
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return day !== undefined ? days[day] : 'unknown';
      }),
    );

    // ─── Dimension 5: Published Hour ───
    dimensions.push(
      this.scoreDimension('hour_of_day', videos, viewMap, benchmark, (v) => {
        const hour = v.publishedAt?.getUTCHours();
        return hour !== undefined ? `${hour}:00 UTC` : 'unknown';
      }),
    );

    // Store all scores
    for (const dim of dimensions) {
      for (const strat of dim.strategies) {
        await this.store(strat);
      }
    }

    this.logger.info(
      { dimensions: dimensions.length },
      'Strategy scoring complete',
    );

    return dimensions;
  }

  /** Score a single dimension by grouping videos */
  private scoreDimension(
    dimensionName: string,
    videos: Array<{
      youtubeVideoId: string | null;
      category: string | null;
      targetDuration: number | null;
      targetAgeMin: number | null;
      targetAgeMax: number | null;
      publishedAt: Date | null;
    }>,
    viewMap: Map<string, { views: number; likes: number }>,
    benchmark: { avgViews: number; avgEngagement: number },
    groupFn: (v: typeof videos[number]) => string,
  ): StrategyDimension {
    const groups = new Map<string, typeof videos>();

    for (const v of videos) {
      const key = groupFn(v);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(v);
    }

    const strategies: StrategyEvaluation[] = [];

    for (const [key, group] of groups) {
      const videoIds = group
        .map((v) => v.youtubeVideoId)
        .filter((id): id is string => !!id);

      let totalViews = 0;
      let totalLikes = 0;
      let count = 0;

      for (const id of videoIds) {
        const data = viewMap.get(id);
        if (data) {
          totalViews += data.views;
          totalLikes += data.likes;
          count++;
        }
      }

      if (count === 0) continue;

      const avgViews = totalViews / count;
      const avgEngagement = totalViews > 0 ? totalLikes / totalViews : 0;

      strategies.push(
        this.evaluate({
          strategy: `${dimensionName}:${key}`,
          category: null,
          videoIds,
          avgViews,
          avgEngagement,
          benchmarkViews: benchmark.avgViews,
          benchmarkEngagement: benchmark.avgEngagement,
        }),
      );
    }

    // Sort by score descending
    strategies.sort((a, b) => b.score - a.score);

    return { dimension: dimensionName, strategies };
  }

  /** Store strategy scores in DB */
  async store(evaluation: StrategyEvaluation): Promise<void> {
    await this.db.insert(strategyScores).values({
      strategy: evaluation.strategy,
      category: evaluation.category,
      score: evaluation.score,
      sampleSize: evaluation.sampleSize,
    });

    this.logger.info(
      { strategy: evaluation.strategy, score: evaluation.score },
      'Strategy scored',
    );
  }

  /** Get top strategies across all dimensions */
  async getTopStrategies(limit = 10): Promise<StrategyEvaluation[]> {
    const results = await this.db.query.strategyScores.findMany({
      orderBy: [desc(strategyScores.score)],
      limit,
    });

    return results.map((r) => ({
      strategy: r.strategy,
      category: r.category as ContentCategory | null,
      score: r.score,
      sampleSize: r.sampleSize ?? 0,
    }));
  }
}
