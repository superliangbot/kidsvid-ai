import type { Logger } from '@kidsvid/shared';
import type { Database } from '@kidsvid/shared';
import { generatedVideos, contentSeries, performanceSnapshots, analysisRuns, desc, sql, count, eq } from '@kidsvid/shared/db';

/** Analytics data layer — serves data for the dashboard API & JSON export. */

export interface SummaryStats {
  totalScripts: number;
  passRate: number;
  avgEducationalScore: number;
  avgEngagementScore: number;
  scriptsPerCategory: Record<string, number>;
  statusBreakdown: Record<string, number>;
  totalSeries: number;
  totalAnalysisRuns: number;
}

export interface VideoOverTime {
  date: string;
  count: number;
}

export interface QualityDistribution {
  bucket: string; // e.g. "7-8", "8-9", "9-10"
  count: number;
}

export interface SeriesProgress {
  seriesId: string;
  name: string;
  totalEpisodes: number;
  generatedEpisodes: number;
  publishedEpisodes: number;
  avgQualityScore: number;
}

export class AnalyticsEngine {
  constructor(
    private db: Database,
    private logger: Logger,
  ) {}

  async getSummaryStats(): Promise<SummaryStats> {
    const allVideos = await this.db.query.generatedVideos.findMany({
      columns: { id: true, category: true, status: true, generationMetadata: true },
    });

    let passCount = 0;
    let totalEdu = 0;
    let totalEng = 0;
    let scored = 0;
    const perCategory: Record<string, number> = {};
    const perStatus: Record<string, number> = {};

    for (const v of allVideos) {
      const cat = v.category ?? 'other';
      perCategory[cat] = (perCategory[cat] ?? 0) + 1;
      const st = v.status ?? 'draft';
      perStatus[st] = (perStatus[st] ?? 0) + 1;

      const meta = v.generationMetadata as Record<string, unknown> | null;
      const qs = meta?.qualityScore as { educationalValue?: number; engagementPotential?: number; passed?: boolean } | undefined;
      if (qs) {
        scored++;
        totalEdu += qs.educationalValue ?? 0;
        totalEng += qs.engagementPotential ?? 0;
        if (qs.passed) passCount++;
      }
    }

    const seriesRows = await this.db.query.contentSeries.findMany({ columns: { id: true } });
    const runRows = await this.db.query.analysisRuns.findMany({ columns: { id: true } });

    return {
      totalScripts: allVideos.length,
      passRate: scored > 0 ? Math.round((passCount / scored) * 100) : 0,
      avgEducationalScore: scored > 0 ? Math.round((totalEdu / scored) * 10) / 10 : 0,
      avgEngagementScore: scored > 0 ? Math.round((totalEng / scored) * 10) / 10 : 0,
      scriptsPerCategory: perCategory,
      statusBreakdown: perStatus,
      totalSeries: seriesRows.length,
      totalAnalysisRuns: runRows.length,
    };
  }

  async getVideosOverTime(days = 30): Promise<VideoOverTime[]> {
    const allVideos = await this.db.query.generatedVideos.findMany({
      columns: { createdAt: true },
      orderBy: [desc(generatedVideos.createdAt)],
    });

    const cutoff = Date.now() - days * 86400_000;
    const dayMap = new Map<string, number>();

    for (const v of allVideos) {
      if (v.createdAt.getTime() < cutoff) continue;
      const day = v.createdAt.toISOString().slice(0, 10);
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }

    return Array.from(dayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getQualityDistribution(): Promise<QualityDistribution[]> {
    const allVideos = await this.db.query.generatedVideos.findMany({
      columns: { generationMetadata: true },
    });

    const buckets: Record<string, number> = { '0-4': 0, '4-5': 0, '5-6': 0, '6-7': 0, '7-8': 0, '8-9': 0, '9-10': 0 };

    for (const v of allVideos) {
      const meta = v.generationMetadata as Record<string, unknown> | null;
      const qs = meta?.qualityScore as { educationalValue?: number } | undefined;
      const score = qs?.educationalValue ?? 0;
      if (score < 4) buckets['0-4']++;
      else if (score < 5) buckets['4-5']++;
      else if (score < 6) buckets['5-6']++;
      else if (score < 7) buckets['6-7']++;
      else if (score < 8) buckets['7-8']++;
      else if (score < 9) buckets['8-9']++;
      else buckets['9-10']++;
    }

    return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
  }

  async getSeriesProgress(): Promise<SeriesProgress[]> {
    const seriesRows = await this.db.query.contentSeries.findMany();
    const results: SeriesProgress[] = [];

    for (const s of seriesRows) {
      const episodes = await this.db.query.generatedVideos.findMany({
        where: eq(generatedVideos.seriesId, s.seriesId),
        columns: { id: true, status: true, generationMetadata: true },
      });

      let totalScore = 0;
      let scored = 0;
      let published = 0;
      for (const ep of episodes) {
        if (ep.status === 'published') published++;
        const meta = ep.generationMetadata as Record<string, unknown> | null;
        const qs = meta?.qualityScore as { educationalValue?: number } | undefined;
        if (qs?.educationalValue) { totalScore += qs.educationalValue; scored++; }
      }

      results.push({
        seriesId: s.seriesId,
        name: s.name,
        totalEpisodes: s.totalEpisodes,
        generatedEpisodes: episodes.length,
        publishedEpisodes: published,
        avgQualityScore: scored > 0 ? Math.round((totalScore / scored) * 10) / 10 : 0,
      });
    }

    return results;
  }

  /** Export all analytics as a single JSON blob */
  async exportAll(): Promise<Record<string, unknown>> {
    const [summary, videosOverTime, qualityDist, seriesProgress] = await Promise.all([
      this.getSummaryStats(),
      this.getVideosOverTime(),
      this.getQualityDistribution(),
      this.getSeriesProgress(),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      summary,
      videosOverTime,
      qualityDistribution: qualityDist,
      seriesProgress,
    };
  }
}
