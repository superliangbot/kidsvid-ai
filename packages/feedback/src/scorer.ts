import type { StrategyEvaluation, ContentCategory, Logger } from '@kidsvid/shared';
import type { Database } from '@kidsvid/shared';
import { strategyScores } from '@kidsvid/shared/db';

/** Score content strategies based on actual performance data. */

export interface StrategyInput {
  strategy: string;
  category: ContentCategory | null;
  videoIds: string[];
  avgViews: number;
  avgEngagement: number;
  benchmarkViews: number;
  benchmarkEngagement: number;
}

export class StrategyScorer {
  constructor(
    private db: Database,
    private logger: Logger,
  ) {}

  /** Evaluate a strategy against benchmarks */
  evaluate(input: StrategyInput): StrategyEvaluation {
    // Score: how much better/worse than benchmark
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
}
